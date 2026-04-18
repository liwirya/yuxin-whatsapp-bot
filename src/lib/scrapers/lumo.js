import axios from 'axios';
import crypto from 'crypto';
import openpgp from 'openpgp';
import http from 'http';
import https from 'https';

const BASE_URL = 'https://lumo.proton.me/api';
const APP_VERSION = 'web-lumo@1.3.3.4';
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const LUMO_PUBLIC_KEY = `-----BEGIN PGP PUBLIC KEY BLOCK-----

xjMEaA9k7RYJKwYBBAHaRw8BAQdABaPA24xROahXs66iuekwPmdOpJbPE1a8A69r
siWP8rfNL1Byb3RvbiBMdW1vIChQcm9kIEtleSAwMDAyKSA8c3VwcG9ydEBwcm90
b24ubWU+wpkEExYKAEEWIQTwMqEWnd/47aco5ZqadMPvYVFKKgUCaA9k7QIbAwUJ
B4TOAAULCQgHAgIiAgYVCgkICwIEFgIDAQIeBwIXgAAKCRCadMPvYVFKKqiVAQD7
JNeudEXTaNMoQMkYjcutNwNAalwbLr5qe6N5rPogDQD/bA5KBWmDlvxVz7If6SBS
7Xzcvk8VMHYkBLKfh+bfUQzOOARoD2TtEgorBgEEAZdVAQUBAQdAnBIJoFt6Pxnp
RAJMHwhdCXaE+lwQFbKgwb6LCUFWvHYDAQgHwn4EGBYKACYWIQTwMqEWnd/47aco
5ZqadMPvYVFKKgUCaA9k7QIbDAUJB4TOAAAKCRCadMPvYVFKKkuRAQChUthLyAcc
UD6UrJkroc6exHIMSR5Vlk4d4L8OeFUWWAEA3ugyE/b/pSQ4WO+fiTkHN2ZeKlyj
dZMbxO6yWPA5uQk=
=h/mc
-----END PGP PUBLIC KEY BLOCK-----`;

class LumoCrypto {
  encryptMessage(message, aesKey, iv, requestId, context = 'turn') {
    const aeadData = Buffer.from(`lumo.request.${requestId}.${context}`, 'utf-8');
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    cipher.setAAD(aeadData);
    const encrypted = Buffer.concat([cipher.update(message, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, tag]);
  }

  decryptResponse(encryptedBase64, aesKey, requestId) {
    const data = Buffer.from(encryptedBase64, 'base64');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(-16);
    const ciphertext = data.subarray(12, -16);
    const aeadData = Buffer.from(`lumo.response.${requestId}.chunk`, 'utf-8');
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAAD(aeadData);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
  }

  async encryptAESKeyWithPGP(aesKey) {
    const publicKey = await openpgp.readKey({ armoredKey: LUMO_PUBLIC_KEY });
    const message = await openpgp.createMessage({ binary: aesKey });
    const encrypted = await openpgp.encrypt({
      message,
      encryptionKeys: publicKey,
      format: 'binary',
      config: { preferredCompressionAlgorithm: openpgp.enums.compression.uncompressed }
    });
    return Buffer.from(encrypted).toString('base64');
  }
}

class LumoClient {
  constructor() {
    this.uid = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.cookieJar = '';
    this.axios = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: {
        'User-Agent': USER_AGENT,
        'x-pm-appversion': APP_VERSION,
        'Accept': 'application/vnd.protonmail.v1+json',
        'Origin': 'https://lumo.proton.me',
        'Referer': 'https://lumo.proton.me/guest'
      },
      httpAgent: new http.Agent({ keepAlive: false }),
      httpsAgent: new https.Agent({ keepAlive: false }),
      withCredentials: true
    });

    this.axios.interceptors.request.use(config => {
      if (this.uid) config.headers['x-pm-uid'] = this.uid;
      if (this.accessToken) config.headers['Authorization'] = `Bearer ${this.accessToken}`;
      if (this.cookieJar) config.headers['Cookie'] = this.cookieJar;
      return config;
    });

    this.axios.interceptors.response.use(
      res => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) this.cookieJar = setCookie.map(c => c.split(';')[0]).join('; ');
        return res;
      },
      async err => {
        if (err.response?.status === 401 && this.refreshToken && !err.config._retried) {
          err.config._retried = true;
          try {
            await this.refreshCookies();
            err.config.headers['x-pm-uid'] = this.uid;
            err.config.headers['Authorization'] = `Bearer ${this.accessToken}`;
            err.config.headers['Cookie'] = this.cookieJar;
            return this.axios(err.config);
          } catch (e) {}
        }
        return Promise.reject(err);
      }
    );
  }

  async initGuestSession() {
    const { data, headers } = await this.axios.post('/auth/v4/sessions', null, {
      headers: { 'x-enforce-unauthsession': 'true' }
    });
    this.uid = data.UID;
    this.accessToken = data.AccessToken;
    this.refreshToken = data.RefreshToken;
    const setCookie = headers['set-cookie'];
    if (setCookie) this.cookieJar = setCookie.map(c => c.split(';')[0]).join('; ');
    await this.refreshCookies();
  }

  async refreshCookies() {
    const state = crypto.randomBytes(24).toString('base64url');
    const { data, headers } = await this.axios.post('/core/v4/auth/cookies', {
      UID: this.uid,
      ResponseType: 'token',
      GrantType: 'refresh_token',
      RefreshToken: this.refreshToken,
      RedirectURI: 'https://protonmail.com',
      Persistent: 0,
      State: state
    });
    if (data.Code !== 1000) throw new Error(`Cookie refresh failed: ${data.Code}`);
    const setCookie = headers['set-cookie'];
    if (setCookie) this.cookieJar = setCookie.map(c => c.split(';')[0]).join('; ');
  }

  async sendMessage(prompt, tools = ['proton_info', 'web_search']) {
    const cryptoUtil = new LumoCrypto();
    const requestId = crypto.randomUUID();
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const encryptedMessage = cryptoUtil.encryptMessage(prompt, aesKey, iv, requestId, 'turn');
    const encryptedKey = await cryptoUtil.encryptAESKeyWithPGP(aesKey);

    const payload = {
      Prompt: {
        type: 'generation_request',
        turns: [{
          role: 'user',
          content: encryptedMessage.toString('base64'),
          images: [],
          encrypted: true
        }],
        options: { tools },
        targets: ['message', 'title'],
        request_key: encryptedKey,
        request_id: requestId
      }
    };

    const response = await this.axios.post('/ai/v1/chat', payload, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'stream'
    });

    return this._parseStream(response.data, aesKey, requestId, cryptoUtil);
  }

  _parseStream(stream, aesKey, requestId, cryptoUtil) {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const result = { title: '', message: '', reasoning: '', jobId: null, modelName: null };
      stream.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5).trim());
              if (data.type === 'ingesting') {
                result.jobId = data.job_id;
                result.modelName = data.model_name;
              } else if (data.type === 'token_data' && data.encrypted) {
                const decrypted = cryptoUtil.decryptResponse(data.content, aesKey, requestId);
                if (data.target === 'message') result.message += decrypted;
                else if (data.target === 'title') result.title += decrypted;
                else if (data.target === 'reasoning') result.reasoning += decrypted;
              }
            } catch (e) {}
          }
        }
      });
      stream.on('end', () => resolve(result));
      stream.on('error', reject);
    });
  }
}

export default {
  process: async (prompt) => {
    const client = new LumoClient();
    await client.initGuestSession();
    const response = await client.sendMessage(prompt);
    return response.message; 
  }
};


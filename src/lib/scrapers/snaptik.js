import * as cheerio from 'cheerio';
import vm from 'vm';

export default async function scrapeSnaptik(tiktokUrl) {
    const userAgent = 'Mozilla/5.0 (Linux; Android 15.0.0; SM-A057F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

    try {
        const baseResponse = await fetch('https://snaptik.app/ID2', {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            }
        });

        const cookieHeader = baseResponse.headers.get('set-cookie');
        const cookies = cookieHeader 
            ? cookieHeader.split(',').map(c => c.split(';')[0].trim()).join('; ') 
            : '';

        const baseHtml = await baseResponse.text();
        const $ = cheerio.load(baseHtml);
        const token = $('input[name="token"]').val();

        if (!token) throw new Error('Gagal mengambil token Snaptik dari halaman utama.');

        const params = new URLSearchParams();
        params.append('url', tiktokUrl);
        params.append('token', token);

        const postResponse = await fetch('https://snaptik.app/abc2.php', {
            method: 'POST',
            body: params.toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookies,
                'Origin': 'https://snaptik.app',
                'Referer': 'https://snaptik.app/ID2',
                'User-Agent': userAgent
            }
        });

        const rawJs = await postResponse.text();
        let extractedHtml = '';
        
        const domMock = {
            set innerHTML(val) { extractedHtml += val; },
            get innerHTML() { return extractedHtml; },
            style: {},
            className: '',
            src: '', 
            html: function(val) { if (val) extractedHtml += val; return this; },
            append: function(val) { if (val) extractedHtml += val; return this; },
            prepend: function(val) { if (val) extractedHtml = val + extractedHtml; return this; },
            show: function() { return this; },
            hide: function() { return this; },
            attr: function() { return ''; },
            val: function() { return ''; },
            text: function() { return this; },
            remove: function() { return this; }, 
            empty: function() { return this; },  
            css: function() { return this; },
            find: function() { return this; },
            parent: function() { return this; },
            ready: function(cb) { if(typeof cb === 'function') cb(); return this; }
        };

        const sandbox = {
            document: {
                getElementById: () => domMock,
                querySelector: () => domMock,
                write: (html) => { extractedHtml += html; }
            },
            window: { location: { href: 'https://snaptik.app/ID2', hostname: 'snaptik.app' } },
            location: { href: 'https://snaptik.app/ID2', hostname: 'snaptik.app' },
            $: () => domMock,          
            jQuery: () => domMock,     
            console: { log: () => {} },
            gtag: () => {}, 
            fbq: () => {},  
            setTimeout: (cb) => { if(typeof cb === 'function') cb(); },
            setInterval: (cb) => { if(typeof cb === 'function') cb(); },
            fetch: async () => ({ json: async () => ({ thumbnail_url: 'mock_thumb_url' }) })
        };
        
        sandbox.window.document = sandbox.document;
        sandbox.window.$ = sandbox.$;
        sandbox.window.gtag = sandbox.gtag;
        sandbox.window.fetch = sandbox.fetch; 

        try {
            const context = vm.createContext(sandbox);
            vm.runInContext(rawJs, context);
        } catch (err) {
            if (!extractedHtml) throw new Error(`VM Error: ${err.message}`);
        }

        if (!extractedHtml) throw new Error('Gagal mengekstrak HTML.');

        const $$ = cheerio.load(extractedHtml);
        const results = { sd: null, hd: null, audio: null };

        $$('a').each((i, el) => {
            let href = $$(el).attr('href');
            if (!href || href === '#') return;

            if (href.startsWith('//')) {
                href = 'https:' + href;
            } else if (href.startsWith('/')) {
                href = 'https://snaptik.app' + href;
            }

            const text = $$(el).text().toLowerCase();

            if (text.includes('mp3') || text.includes('audio') || text.includes('music')) {
                results.audio = href;
            } else if (href.includes('token=') || href.includes('dl=')) {
                if (!results.sd) results.sd = href; 
            }
        });

        const btnHd = $$('button[data-tokenhd]').first();
        const tokenHd = btnHd.attr('data-tokenhd');
        
        if (tokenHd) {
            const apiHdUrl = `https://api.snaptik.app/video-hd?token=${tokenHd}`;
            try {
                const hdRes = await fetch(apiHdUrl, {
                    headers: {
                        'User-Agent': userAgent,
                        'Referer': 'https://snaptik.app/',
                        'Origin': 'https://snaptik.app'
                    }
                });
                
                const hdData = await hdRes.json();
                if (hdData && hdData.url) {
                    results.hd = hdData.url;
                }
            } catch (err) {
                console.error("Gagal mendapatkan link HD:", err.message);
            }
        }

        return { status: true, data: results };

    } catch (error) {
        return { status: false, message: error.message };
    }
}

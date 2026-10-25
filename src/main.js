import { Actor } from 'apify';
import { CheerioCrawler, log } from 'crawlee';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,12}/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-]?)\d{3,4}[\s.-]?\d{3,4}/g;

const IGNORED_EMAIL_PATTERNS = [
    /example\.com$/i,
    /domain\.com$/i,
    /email\.com$/i,
    /yoursite\.com$/i,
    /sentry\.io$/i,
    /wixpress\.com$/i,
    /\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|ttf)$/i,
];

function cleanEmails(rawEmails, excludeFree = true) {
    const unique = new Set();
    for (const raw of rawEmails) {
        const email = raw.trim().toLowerCase().replace(/[.,;:)>\]]+$/, '');
        if (!email || email.length > 100) continue;
        if (excludeFree && IGNORED_EMAIL_PATTERNS.some((rx) => rx.test(email))) continue;
        unique.add(email);
    }
    return [...unique];
}

function cleanPhones(rawPhones) {
    const unique = new Set();
    for (const raw of rawPhones) {
        const digits = raw.replace(/[^\d+]/g, '');
        if (digits.length >= 8 && digits.length <= 15) {
            unique.add(raw.trim());
        }
    }
    return [...unique].slice(0, 10);
}

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
    startUrls = [{ url: 'https://kabeer.site' }],
    crawlContactPages = true,
    maxPagesPerDomain = 4,
    excludeFreeEmailProviders = true,
} = input;

// Map to aggregate contacts per root domain
const domainResults = new Map();
const domainPageCounts = new Map();

const crawler = new CheerioCrawler({
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 30,
    maxConcurrency: 15,
    async requestHandler({ request, $, enqueueLinks }) {
        const parsedUrl = new URL(request.loadedUrl || request.url);
        const domain = parsedUrl.hostname.replace(/^www\./i, '');

        const currentCount = (domainPageCounts.get(domain) || 0) + 1;
        domainPageCounts.set(domain, currentCount);

        const existing = domainResults.get(domain) || {
            domain,
            companyName: $('title').first().text().trim() || domain,
            description: $('meta[name="description"]').attr('content')?.trim() || '',
            emails: new Set(),
            phones: new Set(),
            whatsappLinks: new Set(),
            linkedin: null,
            instagram: null,
            twitter: null,
            facebook: null,
            youtube: null,
            pagesCrawled: [],
            sourceUrl: `${parsedUrl.protocol}//${parsedUrl.hostname}`,
        };

        existing.pagesCrawled.push(request.loadedUrl || request.url);

        const bodyHtml = $.html() || '';
        const bodyText = $('body').text() || '';

        // 1. Extract mailto: links and raw emails
        const foundEmails = [...(bodyHtml.match(EMAIL_REGEX) || [])];
        $('a[href^="mailto:"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const mail = href.replace(/^mailto:/i, '').split('?')[0];
            if (mail) foundEmails.push(mail);
        });
        for (const email of cleanEmails(foundEmails, excludeFreeEmailProviders)) {
            existing.emails.add(email);
        }

        // 2. Extract tel: links and phone numbers
        const foundPhones = [];
        $('a[href^="tel:"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const tel = decodeURIComponent(href.replace(/^tel:/i, '').trim());
            if (tel) foundPhones.push(tel);
        });
        const textPhones = bodyText.match(PHONE_REGEX) || [];
        for (const phone of cleanPhones([...foundPhones, ...textPhones])) {
            existing.phones.add(phone);
        }

        // 3. Extract Social Media & WhatsApp links
        $('a[href]').each((_, el) => {
            const href = ($(el).attr('href') || '').trim();
            if (!href) return;
            const lower = href.toLowerCase();

            if (lower.includes('wa.me/') || lower.includes('api.whatsapp.com/send')) {
                existing.whatsappLinks.add(href);
            } else if (!existing.linkedin && lower.includes('linkedin.com/') && !lower.includes('/share')) {
                existing.linkedin = href;
            } else if (!existing.instagram && lower.includes('instagram.com/')) {
                existing.instagram = href;
            } else if (!existing.twitter && (lower.includes('twitter.com/') || lower.includes('x.com/'))) {
                existing.twitter = href;
            } else if (!existing.facebook && lower.includes('facebook.com/') && !lower.includes('sharer')) {
                existing.facebook = href;
            } else if (!existing.youtube && lower.includes('youtube.com/')) {
                existing.youtube = href;
            }
        });

        domainResults.set(domain, existing);

        // 4. Enqueue internal /contact, /about, /support pages if under limit
        if (crawlContactPages && currentCount < maxPagesPerDomain) {
            await enqueueLinks({
                strategy: 'same-hostname',
                globs: [
                    `**/*contact*`,
                    `**/*about*`,
                    `**/*team*`,
                    `**/*support*`,
                    `**/*impressum*`,
                ],
                transformRequestFunction(req) {
                    const count = domainPageCounts.get(domain) || 0;
                    if (count >= maxPagesPerDomain) return false;
                    return req;
                },
            });
        }
    },
    failedRequestHandler({ request }) {
        log.warning(`Failed to crawl ${request.url}`);
    },
});

await crawler.run(startUrls);

// Push aggregated leads and trigger Pay-Per-Event charging if configured
for (const [, record] of domainResults.entries()) {
    const item = {
        domain: record.domain,
        companyName: record.companyName,
        description: record.description,
        emails: [...record.emails],
        phones: [...record.phones],
        whatsappLinks: [...record.whatsappLinks],
        linkedin: record.linkedin,
        instagram: record.instagram,
        twitter: record.twitter,
        facebook: record.facebook,
        youtube: record.youtube,
        pagesCrawledCount: record.pagesCrawled.length,
        sourceUrl: record.sourceUrl,
        scrapedAt: new Date().toISOString(),
    };

    await Actor.pushData(item);

    // Trigger Pay-Per-Event charge when at least one contact point is found
    if (item.emails.length > 0 || item.phones.length > 0 || item.whatsappLinks.length > 0) {
        try {
            if (typeof Actor.charge === 'function') {
                await Actor.charge({ eventName: 'lead-extracted', count: 1 });
            }
        } catch {
            // Ignore in local/non-PPE runs
        }
    }
}

log.info(`Completed scraping ${domainResults.size} B2B domains.`);
await Actor.exit();

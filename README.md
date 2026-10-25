# B2B Website Email, Phone, WhatsApp & Social Links Scraper

Extract verified **B2B emails, phone numbers, WhatsApp links (`wa.me`), and social media profiles (LinkedIn, Instagram, X/Twitter, Facebook, YouTube)** from any list of company websites in seconds.

Built with **CheerioCrawler** for maximum speed and ultra-low compute usage—perfect for **n8n workflows**, **Make.com automations**, **Clay enrichment**, and **cold outreach agencies**.

## Features
- **High-Speed HTTP Crawling:** Uses lightweight HTML parsing (10x faster and cheaper than headless browsers).
- **Automatic Contact Page Discovery:** Automatically detects and crawls `/contact`, `/about`, `/team`, and `/support` pages on each domain.
- **Smart Email & Phone Filtering:** Strips out false-positive image filenames, Sentry/Wix system emails, and invalid phone strings.
- **WhatsApp Direct Link Detection:** Captures `wa.me` and `api.whatsapp.com` business chat links.
- **Structured JSON / CSV / Excel Output:** Ready to import directly into HubSpot, Apollo, Instantly, Smartlead, or Google Sheets.

## Input Parameters
| Field | Type | Description |
| :--- | :--- | :--- |
| `startUrls` | Array | List of company URLs to scrape. |
| `crawlContactPages` | Boolean | Automatically follow internal `/contact` and `/about` links (default: `true`). |
| `maxPagesPerDomain` | Integer | Max internal pages to inspect per website (default: `4`). |
| `excludeFreeEmailProviders` | Boolean | Filter out placeholder/system emails (default: `true`). |

## Output Example
```json
{
  "domain": "kabeer.site",
  "companyName": "Kabeer Ahmed — Official Portfolio | Full-Stack Developer & UI/UX Expert",
  "emails": ["systemskns@gmail.com"],
  "phones": ["+923001111111"],
  "whatsappLinks": [],
  "linkedin": "https://www.linkedin.com/in/kabeerahmed-dev",
  "instagram": "https://instagram.com/_kabeer.ahmed_",
  "sourceUrl": "https://kabeer.site"
}
```

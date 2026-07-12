const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    try {
        const browser = await puppeteer.launch({
            headless: 'new'
        });
        const page = await browser.newPage();
        
        const htmlContent = fs.readFileSync('submission-premium.html', 'utf8');
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        await page.pdf({
            path: 'RA2311003011810.pdf',
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0px',
                bottom: '0px',
                left: '0px',
                right: '0px'
            }
        });
        
        await browser.close();
        console.log("PDF generation complete!");
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();

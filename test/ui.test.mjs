export default async function ({ page, errors, check }) {
    const info = await page.evaluate(() => {
        const heading = document.querySelector(".app-header h1");
        const logo = document.querySelector(".app-logo");
        const headingStyle = getComputedStyle(heading);
        const bodyStyle = getComputedStyle(document.body);
        return {
            heading: { family: headingStyle.fontFamily, size: headingStyle.fontSize, weight: headingStyle.fontWeight },
            body: { family: bodyStyle.fontFamily, size: bodyStyle.fontSize, weight: bodyStyle.fontWeight },
            logoLoaded: logo.complete && logo.naturalWidth > 0,
            logoBox: logo.getBoundingClientRect().width,
            logoBeforeText: logo.getBoundingClientRect().right <= heading.getBoundingClientRect().left,
        };
    });

    check("heading shares the body font family", info.heading.family === info.body.family, info.heading.family);
    check("heading shares the body weight", info.heading.weight === info.body.weight,
          `${info.heading.weight} vs ${info.body.weight}`);
    check("heading is larger than body text", parseFloat(info.heading.size) > parseFloat(info.body.size),
          `${info.heading.size} vs ${info.body.size}`);
    check("logo loads", info.logoLoaded, `${info.logoBox}px`);
    check("logo sits left of the title", info.logoBeforeText);
    check("no failed requests (favicon included)", errors.length === 0, errors.join(" | "));
}

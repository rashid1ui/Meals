const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('index.html', 'utf8');
const appjs = fs.readFileSync('app.js', 'utf8');

const dom = new JSDOM(html, { 
    runScripts: "dangerously", 
    resources: "usable" 
});

dom.window.eval(appjs);

console.log("Loading screen display:", dom.window.document.getElementById('loading-screen').style.display);
console.log("Auth screen display:", dom.window.document.getElementById('auth-screen').style.display);

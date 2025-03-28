/*
Copyright (c) 2017, ZOHO CORPORATION
License: MIT
*/
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const DEVELOPER_TOKEN = process.env.DEVELOPER_TOKEN;
const CUSTOMER_ID = process.env.CUSTOMER_ID;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const ZOHO_API = process.env.ZOHO_API;

var fs = require('fs');
var path = require('path');
var express = require('express');
const cors = require('cors');
var bodyParser = require('body-parser');
var errorHandler = require('errorhandler');
var morgan = require('morgan');
var serveIndex = require('serve-index');
var https = require('https');
var chalk = require('chalk');
var axios = require('axios');
const { send } = require('process');
const { fetchAds } = require('./googleAds');



process.env.PWD = process.env.PWD || process.cwd();


var expressApp = express();
var port = process.env.PORT || 5000;

expressApp.use(cors());
expressApp.set('port', port);
expressApp.use(morgan('dev'));
expressApp.use(bodyParser.json());
expressApp.use(bodyParser.urlencoded({ extended: false }));
expressApp.use(errorHandler());


expressApp.use('/', function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

expressApp.get('/plugin-manifest.json', function (req, res) {
    res.sendfile('plugin-manifest.json');
});

expressApp.use('/app', express.static('app'));
expressApp.use('/app', serveIndex('app'));


expressApp.get('/', function (req, res) {
    res.redirect('/app');
});



expressApp.get('/app/leads/:startDate/:endDate', async function (req, res) {
    console.log("req object: ", req.params);
    // console.log("dates in backend: ", startDate, endDate)
    const start = new Date(req.params.startDate);
    const end = new Date(req.params.endDate);

    const response = await axios.get(process.env.ZOHO_API);
    // console.log(response);
    const output = JSON.parse(response.data.details.output);
    const leads = output.leads_data;

    const dateMap = {};

    let total_cost_google = 0;
    let total_cost_facebook = 0;
    let meetings_done = 0;
    let qualified = 0;
    let future_qualified = 0;
    let leads_count = 0;
    let converted = 0;
    let google_clicks = 0;
    const ads = await fetchAds();


    for (let x of leads) {
        const lead_date = new Date(x.date);
        if (start <= lead_date && end >= lead_date) {
            const dateStr = lead_date.toISOString().split('T')[0];
            if (!dateMap[dateStr]) {
                dateMap[dateStr] = {
                    budget: 0,
                    meetings_done: 0,
                    qualified: 0,
                    future_qualified: 0,
                    leads_count: 0,
                    converted: 0
                };
            }
            if (x.source == 'Google AdWords') {
                if (x.mobile?.length > 9 && x.mobile?.length < 14) {
                    dateMap[dateStr].leads_count++;
                    leads_count++;
                }
                if (x.iss == "Meeting Done") {
                    dateMap[dateStr].meetings_done++;
                    meetings_done++;
                }
                if (x.qs == "Qualified") {
                    dateMap[dateStr].qualified++;
                    qualified++;
                }
                if (x.qs == "Future Qualified") {
                    dateMap[dateStr].future_qualified++;
                    future_qualified++;
                }
                if (x.converted) {
                    dateMap[dateStr].converted++;
                    converted++;
                }
            }
        }
    }

    let cnt = 0;
    console.log("ads data: ");
    for (let y of ads) {
        let ad_date = new Date(y.segments.date);
        if (start <= ad_date && end >= ad_date) {
            const dateStr = ad_date.toISOString().split('T')[0];
            if (!dateMap[dateStr]) {
                dateMap[dateStr] = {
                    budget: 0,
                    meetings_done: 0,
                    qualified: 0,
                    leads_count: 0,
                    google_clicks: 0
                };
            }
            let cost = 1.00 * y.metrics.costMicros / 1000000;

            if (cost != null) {
                dateMap[dateStr].budget += cost;
                total_cost_google += cost;
            }

            if (y.metrics.clicks) {
                google_clicks += y.metrics.clicks;
                dateMap[dateStr].google_clicks += y.metrics.clicks;
            }


        }
    }

    const labels = Object.keys(dateMap).sort();
    const budgetData = labels.map(date => dateMap[date].budget);
    const meetingsData = labels.map(date => dateMap[date].meetings_done);
    const qualifiedData = labels.map(date => dateMap[date].qualified);
    const leadsData = labels.map(date => dateMap[date].leads_count);
    const convertedData = labels.map(date => dateMap[date].converted || 0);

    let cpl = 0;
    if (leads_count > 0) {
        cpl = total_cost_google / leads_count;
    }

    let cpm = 0;
    if (meetings_done > 0) {
        cpm = total_cost_google / meetings_done;
    }

    let lpq = 0;
    if (qualified > 0) {
        lpq = leads_count / qualified;
    }

    let lpc = 0;
    if (converted > 0) {
        lpc = total_cost_google / converted;
    }

    const sendData = {
        google_budget: total_cost_google,
        facebook_budget: total_cost_facebook,
        // budget: total_cost,
        leads: leads_count,
        qualified,
        future_qualified,
        converted,
        meetings_done,
        cpl,
        cpm,
        lpq,
        lpc,
        labels,
        budgetData,
        meetingsData,
        qualifiedData,
        leadsData,
        convertedData
    }

    res.json(sendData);

})

var options = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
};

expressApp.listen(port, () => {
    console.log(chalk.green(`Zet running on http://localhost:${port}`));
});

const express = require('express');
const axios = require('axios').default;
const { GoogleAuth } = require('google-auth-library');
const bodyParser = require('body-parser');
const moment = require('moment'); // Make sure to install moment
const app = express();
const port = process.env.PORT || 8080;

// Check if API_KEY is set, if not exit with status code 1
if (!process.env.API_KEY) {
  console.error('API_KEY environment variable is not set. Exiting...');
  process.exit(1);
}

// Middleware to check for x-apikey header and validate it
app.use((req, res, next) => {
  const apiKeyHeader = req.headers['x-apikey'];
  if (!apiKeyHeader) {
    return res.status(401).send('API key is required.');
  }
  if (apiKeyHeader !== process.env.API_KEY) {
    return res.status(401).send('Invalid API key.');
  }
  next();
});

app.use(bodyParser.json());

/**
 * Helper function to invoke the backend bookings service
 * @param {*} param0 
 * @returns 
 */
async function invokeBackendService({ method, url, data }) {
  console.log('Retrieving token');
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(url);
  const idToken = await client.idTokenProvider.fetchIdToken(url);
  console.log('Token retrieved');

  console.log('Invoking backend service');
  const response = await axios({
    method,
    url,
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    data
  });
  console.log('Backend service response received');
  return response;
}

function mapRecordFields(record, fields) {
  const mappedRecord = {};
  Object.keys(record).forEach(key => {
    mappedRecord[fields[key]?.display || key] = record[key];
  });
  return mappedRecord;
}

async function fetchDataAndRespond(req, res) {
  const { orgId } = req.params;
  const endpoint = req.path.split('/').pop(); // 'cleanings' or 'reservations'
  const serviceHost = process.env.BOOKINGS_SERVICE_HOST;
  if (!serviceHost) {
    return res.status(500).send('Configuration error: BOOKINGS_SERVICE_HOST is not defined.');
  }
  const targetAudience = `https://${serviceHost}`;
  const apiUrl = `${targetAudience}/o/${orgId}/${endpoint}`;

  try {
    const response = await invokeBackendService({ method: 'GET', url: apiUrl });
    const { records, fields } = response.data;
    const data = {};
    data[endpoint] = records.map(record => mapRecordFields(record, fields));
    res.json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Error fetching data');
  }
}

// New convertInput function
function convertInput(input) {
  let converted = {};
  if (input.hasOwnProperty('Door Access')) {
    if (input['Door Access']) {
      converted.doorAccess = moment(input['Door Access'], 'MM/DD/YYYY HH:mm:ss A').format('YYYY-MM-DD');
    } else {
      converted.doorAccess = '';
    }
  }
  return converted;
}

app.get('/o/:orgId/cleanings', fetchDataAndRespond);
app.get('/o/:orgId/reservations', fetchDataAndRespond);

app.put('/o/:orgId/reservations/:conf', async (req, res) => {
  console.log('Received PUT data:', req.body);
  const { orgId, conf } = req.params;
  const convertedData = convertInput(req.body);

  if (convertedData.hasOwnProperty('doorAccess')) {
    const serviceHost = process.env.BOOKINGS_SERVICE_HOST;
    const targetAudience = `https://${serviceHost}`;
    const apiUrl = `${targetAudience}/events`;
    
    const postData = {
      type: "update",
      conf: conf,
      ...convertedData // Spread the converted data into postData
    };

    try {
      await invokeBackendService({ method: 'POST', url: apiUrl, data: postData });
      res.send('Door access updated successfully');
    } catch (error) {
      console.error('Error updating door access:', error);
      res.status(500).send('Error updating door access');
    }
  } else {
    res.status(400).send('Invalid request data: "Door Access" field is missing or incorrect.');
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
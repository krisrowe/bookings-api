const express = require('express');
const axios = require('axios').default;
const { GoogleAuth } = require('google-auth-library');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 8080;

app.use(bodyParser.json());

// Common function to invoke backend service with token
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

// Simplified generic mapper for records based on fields specification
function mapRecordFields(record, fields) {
  const mappedRecord = {};
  Object.keys(record).forEach(key => {
    mappedRecord[fields[key]?.display || key] = record[key];
  });
  return mappedRecord;
}

// Reusable function for fetching and responding with data
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
    const data = {  };
    data[endpoint] = records.map(record => mapRecordFields(record, fields));
    res.json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Error fetching data');
  }
}

app.get('/o/:orgId/cleanings', fetchDataAndRespond);
app.get('/o/:orgId/reservations', fetchDataAndRespond);

app.put('/o/:orgId/reservations/:conf', async (req, res) => {
  console.log('Received PUT data:', req.body);
  const { orgId, conf } = req.params; // Capture 'conf' from URL
  if (typeof req.body === 'object' && req.body['Door Access']) {
    const serviceHost = process.env.BOOKINGS_SERVICE_HOST;
    const targetAudience = `http://${serviceHost}`;
    const apiUrl = `${targetAudience}/events`;
    // Use 'conf' from URL params instead of body
    const postData = {
      type: "update",
      conf: conf, // Use conf from URL params
      doorAccess: new Date(req.body['Door Access']).toISOString().slice(0, 10)
    };

    try {
      await invokeBackendService({ method: 'POST', url: apiUrl, data: postData });
      res.send('Door access updated successfully');
    } catch (error) {
      console.error('Error updating door access:', error);
      res.status(500).send('Error updating door access');
    }
  } else {
    // More descriptive error message
    res.status(400).send('Invalid request data: "Door Access" field is missing or incorrect.');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

const functions = require('@google-cloud/functions-framework');
const axios = require('axios').default;
const { GoogleAuth } = require('google-auth-library');

// Helper function to get ID token for target audience
async function getIdTokenForTargetAudience(targetAudience) {
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(targetAudience);
  const idToken = await client.idTokenProvider.fetchIdToken(targetAudience);
  return idToken;
}

// Simplified generic mapper for records based on fields specification
function mapRecordFields(record, fields) {
  const mappedRecord = {};
  Object.keys(record).forEach(key => {
    // Map the value directly with an optional check for a display name override
    mappedRecord[fields[key]?.display || key] = record[key];
  });
  return mappedRecord;
}

functions.http('helloHttp', async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Extract orgId from the path
  const orgId = pathname.split('/')[2]; // Assuming path format is `/o/:orgId/cleanings`

  // API Key verification
  const apiKey = process.env.API_KEY;
  const requestApiKey = req.headers['x-apikey'];
  if (apiKey !== requestApiKey) {
    res.status(400).send('Invalid API Key');
    return;
  }

  // Ensure BOOKINGS_SERVICE_HOST is defined
  if (!process.env.BOOKINGS_SERVICE_HOST) {
    console.error('BOOKINGS_SERVICE_HOST environment variable is not defined.');
    res.status(500).send('Configuration error');
    return;
  }

  if (pathname.includes('/cleanings')) {
    // Query the backend service for cleanings data
    try {
      const serviceHost = process.env.BOOKINGS_SERVICE_HOST;
      const targetAudience = `https://${serviceHost}`;
      const apiUrl = `${targetAudience}/o/${orgId}/cleanings`;

      // Fetch ID token for the target audience
      const idToken = await getIdTokenForTargetAudience(targetAudience);

      const response = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Accept': 'application/json'
        }
      });

      // Process and respond with the data
      const { records, fields } = response.data;
      const bookings = records.map(record => mapRecordFields(record, fields));

      res.json({ bookings });
    } catch (error) {
      console.error('Error querying backend service:', error);
      res.status(500).send('Error fetching booking data');
    }
  } else {
    // Default response for other paths
    res.send(`Hello ${req.query.name || req.body.name || 'World'}!`);
  }
});
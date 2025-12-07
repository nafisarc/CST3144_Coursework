require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;


// Parse JSON bodies
app.use(express.json());

// Logger middleware 
app.use(function (req, res, next) {
  const now = new Date().toISOString();

  console.log('--- Incoming Request ---');
  console.log('Time:', now);
  console.log('Method:', req.method);
  console.log('URL:', req.url);

  // Only log body if it’s not empty
  if (Object.keys(req.body || {}).length > 0) {
    console.log('Body:', req.body);
  }

  // Log the status code
  res.on('finish', () => {
    console.log('Status:', res.statusCode);
    console.log('------------------------');
  });

  // Hand over to the next route
  next();
});

// Simple CORS 
app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// MongoDB setup
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let db = null;

// Start server AFTER DB connection 
async function startServer() {
  console.log('server.js starting…');

  try {
    // Connect to Atlas
    await client.connect();
    console.log('Connected to MongoDB');

    db = client.db('webstore'); 

    // Start listening for HTTP requests
    app.listen(PORT, function () {
      console.log(`API server listening on http://localhost:${PORT}`);
      console.log('Try:  http://localhost:3000/collection/lessons (local dev)');
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
}

startServer();

process.on('SIGINT', async () => {
  console.log('Shutting down');
  try {
    await client.close();
    console.log('MongoDB connection closed');
  } catch (err) {
    console.error('Error closing MongoDB client', err);
  }
  process.exit(0);
});

// Routes

// app.param to auto-load collection from the URL
app.param('collectionName', function (req, res, next, collectionName) {
  req.collection = db.collection(collectionName);
  return next();
});

// Root route
app.get('/', function (req, res) {
  res.send('Select a collection, e.g., /collection/lessons');
});

// GET all documents from a collection
app.get('/collection/:collectionName', async function (req, res, next) {
  try {
    const collectionName = req.params.collectionName;
    const search = (req.query.q || '').trim();
    
    let query = {};

    // If searching lessons and q is provided, build a MongoDB regex query
    if (collectionName === 'lessons' && search) {
      const regex = new RegExp(search, 'i'); // case-insensitive
      query = {
        $or: [
          { title: regex },
          { description: regex },
          { location: regex }
        ]
      };
    }

    const docs = await req.collection.find(query).toArray();
    res.send(docs);
  } catch (e) {
    next(e);
  }
});


app.post('/collection/:collectionName', async function (req, res, next) {
  try {
    const newDoc = req.body; // the JSON sent from the front-end

    const result = await req.collection.insertOne(newDoc);

    // Respond with the saved document
    res.status(201).send({
      _id: result.insertedId,
      ...newDoc
    });
  } catch (e) {
    next(e);
  }
});

// Update lessons in the collection
app.put('/collection/:collectionName/:id', async function (req, res, next) {
  try {
    const collectionName = req.params.collectionName;
    const idParam = req.params.id;

    let query;

    if (collectionName === 'lessons') {
      query = { id: Number(idParam) };
    } else {
      query = { _id: new ObjectId(idParam) };
    }

    const update = { $set: req.body }; // update whatever fields are sent

    const result = await req.collection.updateOne(query, update);

    if (result.matchedCount === 0) {
      return res.status(404).send({ error: 'Document not found for update.' });
    }

    res.send({
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      updatedFields: req.body
    });
  } catch (e) {
    next(e);
  }
});

// Error handler
app.use(function (err, req, res, next) {
  console.error('Unhandled error:', err);
  res.status(500).send({ error: 'Something went wrong on the server.' });
});

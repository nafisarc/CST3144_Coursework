// Load environment variables
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
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

  // Log the status code once the response finishes
  res.on('finish', () => {
    console.log('Status:', res.statusCode);
    console.log('------------------------');
  });

  next();
});

// Simple CORS
app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let db = null;

// Start server after DB connection
async function startServer() {
  console.log('server.js starting…');

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    db = client.db('webstore');

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

// Shutdown
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


// app.param to auto-load collection from the URL
app.param('collectionName', function (req, res, next, collectionName) {
  req.collection = db.collection(collectionName);
  return next();
});

// Root route
app.get('/', function (req, res) {
  res.send('Select a collection, e.g., /collection/lessons');
});

// Static image middleware
app.get('/images/:fileName', function (req, res) {
  const fileName = req.params.fileName;
  const filePath = path.join(__dirname, 'images', fileName);

  // Check if the file exists
  fs.access(filePath, fs.constants.F_OK, function (err) {
    if (err) {
      // File does not exist
      return res.status(404).send({ error: 'Image file not found' });
    }

    // File exists
    res.sendFile(filePath);
  });
});

// Search query for lessons
function buildLessonSearchQuery(search) {
  const trimmed = (search || '').trim();
  if (!trimmed) return {};

  const regex = new RegExp(trimmed, 'i'); // case-insensitive
  return {
    $or: [
      { title: regex },
      { description: regex },
      { location: regex }
    ]
  };
}

// GET /lessons  
app.get('/lessons', async function (req, res, next) {
  try {
    const search = req.query.q || '';
    const collection = db.collection('lessons');
    const query = buildLessonSearchQuery(search);

    const docs = await collection.find(query).toArray();
    res.send(docs);
  } catch (e) {
    next(e);
  }
});

// GET /search?q=... 
app.get('/search', async function (req, res, next) {
  try {
    const search = req.query.q || '';
    const collection = db.collection('lessons');
    const query = buildLessonSearchQuery(search);

    const docs = await collection.find(query).toArray();
    res.send(docs);
  } catch (e) {
    next(e);
  }
});

// GET all documents from a collection
app.get('/collection/:collectionName', async function (req, res, next) {
  try {
    const collectionName = req.params.collectionName;
    const search = req.query.q || '';

    let query = {};

    if (collectionName === 'lessons') {
      query = buildLessonSearchQuery(search);
    }

    const docs = await req.collection.find(query).toArray();
    res.send(docs);
  } catch (e) {
    next(e);
  }
});

// POST a new document into a collection 
app.post('/collection/:collectionName', async function (req, res, next) {
  try {
    const newDoc = req.body; // JSON from front-end
    const result = await req.collection.insertOne(newDoc);

    res.status(201).send({
      _id: result.insertedId,
      ...newDoc
    });
  } catch (e) {
    next(e);
  }
});

// PUT to update lessons 
app.put('/collection/:collectionName/:id', async function (req, res, next) {
  try {
    const collectionName = req.params.collectionName;
    const idParam = req.params.id;

    let query;

    if (collectionName === 'lessons') {
      // lessons identified by numeric id field
      query = { id: Number(idParam) };
    } else {
      // other collections use MongoDB ObjectId
      query = { _id: new ObjectId(idParam) };
    }

    const update = { $set: req.body };

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

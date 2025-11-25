require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Basic middleware ---

// Parse JSON bodies
app.use(express.json());

// Simple CORS 
app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// --- MongoDB setup ---
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let db = null;

// --- Start server AFTER DB connection ---
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

// --- Routes ---

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
    const docs = await req.collection.find({}).toArray();
    res.send(docs);
  } catch (e) {
    next(e);
  }
});

// Basic error handler
app.use(function (err, req, res, next) {
  console.error('Unhandled error:', err);
  res.status(500).send({ error: 'Something went wrong on the server.' });
});

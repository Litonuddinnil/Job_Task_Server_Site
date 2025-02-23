const express = require("express");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const port = process.env.PORT || 10000;

const allowedOrigins = [
  "http://localhost:5173", // Local Development
  "https://job-task-cae1b.web.app", // Deployed Frontend
];

// ✅ CORS Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, origin);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // ✅ Must be true for authentication
  })
);

// ✅ Express Middleware
app.use(express.json());

// ✅ WebSocket (Socket.io) er jonno CORS setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // ✅ WebSockets er jonno specific origin dite hobe
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ✅ MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jc89u.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const tasksCollection = client.db("jobTaskCollection").collection("tasks");

    // ✅ WebSockets for Real-time Updates
    io.on("connection", (socket) => {
      console.log("🔗 Client connected:", socket.id);

      socket.on("disconnect", () => {
        console.log("❌ Client disconnected:", socket.id);
      });
    });

    // ✅ REST API Routes
    app.get("/tasks", async (req, res) => {
      try {
        const tasks = await tasksCollection.find().toArray();
        res.json(tasks);
      } catch (error) {
        res.status(500).json({ message: "Error fetching tasks", error });
      }
    });
    app.get("/tasks/:id",async(req,res)=>{
      try {
        const { id } = req.params;
        const task = await tasksCollection.findById( { _id: new ObjectId(id) });
    
        if (!task) {
          return res.status(404).json({ message: "Task not found" });
        }
    
        res.json(task);
      } catch (error) {
        res.status(500).json({ message: "Server error", error });
      }
    })

    app.post("/tasks", async (req, res) => {
      const newTask = req.body;
      try {
        const result = await tasksCollection.insertOne(newTask);
        io.emit("taskAdded", { ...newTask, _id: result.insertedId });
        res.status(201).json({ ...newTask, _id: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: "Error creating task", error });
      }
    });

    app.put("/tasks/:id", async (req, res) => {
      const id = req.params.id;
      const updatedTask = req.body;
      try {
        const result = await tasksCollection.updateOne(
          { _id: id },
          { $set: updatedTask }
        );
        if (result.modifiedCount === 0) return res.status(404).json({ message: "Task not found" });
        io.emit("taskUpdated", { ...updatedTask, _id: id });
        res.json({ message: "Task updated successfully" });
      } catch (error) {
        res.status(500).json({ message: "Error updating task", error });
      }
    });

    app.delete("/tasks/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Task not found" });
        io.emit("taskDeleted", id);
        res.json({ message: "Task deleted successfully" });
      } catch (error) {
        res.status(500).json({ message: "Error deleting task", error });
      }
    });
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
  }
}

run().catch(console.dir);

// ✅ Default Route
app.get("/", (req, res) => {
  res.send("✅ Task Management Backend is running!");
});

// ✅ Start Server
server.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

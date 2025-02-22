const express = require("express");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const http = require("http");
const { Server } = require("socket.io");
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
});

// Initialize Express App
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(
  cors({
    origin:["http://localhost:5173","https://job-task-server-site.vercel.app"],
    credentials: true,
  })
);

// Create HTTP Server & WebSocket
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173","https://job-task-server-site.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// MongoDB Connection
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
    const tasksCollection = client.db("jobTaskCollection").collection("tasks");
    const userCollection = client.db("jobTaskCollection").collection("users");

    // Real-time MongoDB Change Streams
    const changeStream = tasksCollection.watch();
    changeStream.on("change", (change) => {
      io.emit("taskUpdated", change);
    });

    // Routes
    // users
    app.get("/users", async (req, res) => {
      try {
        const result = await userCollection.find().toArray();
        res.status(200).json(result);
      } catch (error) {
        res.status(500).json({ message: "Error fetching users" });
      }
    });

    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const result = await userCollection.insertOne(newUser);
      io.emit("taskAdded", newUser);
      res.status(201).json({ ...newUser, _id: result.insertedId });
    });

    // ✅ Get All Tasks (For Logged-in User)
    app.get("/tasks", async (req, res) => {
      try {
        const tasks = await tasksCollection
          .find()
          .sort({ timestamp: 1 })
          .toArray();
        res.json(tasks);
      } catch (error) {
        res.status(500).json({ message: "Error fetching tasks from database." });
      }
    });

    // ✅ Create a New Task
    app.post("/tasks", async (req, res) => {
      const { title, description, category, deadline, budget } = req.body;
      if (!title || title.length > 50)
        return res.status(400).json({ message: "Title is required (Max 50 chars)" });

      try {
        const newTask = {
          title,
          description: description || "",
          timestamp: new Date(),
          category: category || "To-Do",
          deadline,
          budget,
        };

        const result = await tasksCollection.insertOne(newTask);
        io.emit("taskAdded", newTask);
        res.status(201).json({ ...newTask, _id: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: "Error creating task", error });
      }
    });

    // ✅ Update Task (Title, Description, Category)
    app.put("/tasks/:id", async (req, res) => {
      const id = req.params.id;
       
      const { category } = req.body;

      try {
        const result = await tasksCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: { category },
          }
        );

        if (result.modifiedCount === 0)
          return res.status(404).json({ message: "Task not found or not modified" });

        io.emit("taskUpdated", { operationType: "update", documentKey: { _id: id } });
        res.json({ message: "Task updated successfully" });
      } catch (error) {
        res.status(500).json({ message: "Error updating task", error });
      }
    });

    // ✅ Delete Task
    app.delete("/tasks/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await tasksCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0)
          return res.status(404).json({ message: "Task not found" });

        io.emit("taskDeleted", { _id: id });
        res.json({ message: "Task deleted successfully" });
      } catch (error) {
        res.status(500).json({ message: "Error deleting task", error });
      }
    });  
    app.put('/task/edit/:id', async (req, res) => {
       const id = req.params.id;
       const { category,title,description,budget } = req.body;
        console.log(category)
       try {
         const result = await tasksCollection.updateOne(
           { _id: new ObjectId(id) },
           {
             $set: { category,title,description,budget },
           }
         );
 
         if (result.modifiedCount === 0)
           return res.status(404).json({ message: "Task not found or not modified" });
 
         io.emit("taskUpdated", { operationType: "update", documentKey: { _id: id } });
         res.json({ message: "Task updated successfully" });
       } catch (error) {
         res.status(500).json({ message: "Error updating task", error });
       }
  });
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run().catch(console.dir);

// Default Route
app.get("/", (req, res) => {
  res.send("Task Management Backend is running!");
});

// Start Server
server.listen(port, () => {
  console.log(`Task Management API running on port ${port}`);
});

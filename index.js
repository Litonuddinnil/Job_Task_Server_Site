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
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Create HTTP Server & WebSocket
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
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

    console.log("MongoDB connected");

    // Real-time MongoDB Change Streams
    const changeStream = tasksCollection.watch();
    changeStream.on("change", (change) => {
      console.log("Task Change Detected:", change);
      io.emit("taskUpdated", change);
    });

    // Routes
    // users
    app.get("/users", async (req, res) => {
      try {
        // Fetch all users from the database
        const result = await userCollection.find().toArray();
        console.log("Fetched users:", result);
        res.status(200).json(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Error fetching users" });
      }
    });
    
    app.post("/users", async (req, res) => {
      const newUser = req.body;
      console.log("Creating new user:", newUser);
      const result = await userCollection.insertOne(newUser);
      io.emit("taskAdded", newUser);
      console.log("New user added:", newUser);
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
        console.error("Error fetching tasks:", error);
        res.status(500).json({ message: "Error fetching tasks from database." });
      }
    });

    // ✅ Create a New Task
    app.post("/tasks", async (req, res) => {
      const { title, description, category } = req.body;
      console.log("Received task creation request:", title, description, category);
      if (!title || title.length > 50)
        return res.status(400).json({ message: "Title is required (Max 50 chars)" });

      try {
        const newTask = {
          title,
          description: description || "",
          timestamp: new Date(),
          category: category || "To-Do", 
        };

        const result = await tasksCollection.insertOne(newTask);
        io.emit("taskAdded", newTask);
        console.log("New task created:", newTask);
        res.status(201).json({ ...newTask, _id: result.insertedId });
      } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ message: "Error creating task", error });
      }
    });

    // ✅ Update Task (Title, Description, Category)
    app.put("/tasks/:id", async (req, res) => {
      const id = req.params.id;
      
      const { category } = req.body;
      console.log(`Updating task with ID: ${id}`, category);

      try {
        const result = await tasksCollection.updateOne(
          { _id: new ObjectId(id)},
          {
            $set: { category },
          }
        );

        if (result.modifiedCount === 0)
          return res.status(404).json({ message: "Task not found or not modified" });

        io.emit("taskUpdated", { operationType: "update", documentKey: { _id: id } });
        console.log("Task updated successfully:", id);
        res.json({ message: "Task updated successfully" });
      } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).json({ message: "Error updating task", error });
      }
    });

    // ✅ Delete Task
    app.delete("/tasks/:id", async (req, res) => {
      const id = req.params.id;
      console.log(`Deleting task with ID: ${id}`);

      try {
        const result = await tasksCollection.deleteOne({
          _id: new ObjectId(id),
          userId: req.user.uid,
        });

        if (result.deletedCount === 0)
          return res.status(404).json({ message: "Task not found" });

        io.emit("taskDeleted", { _id: id });
        console.log("Task deleted successfully:", id);
        res.json({ message: "Task deleted successfully" });
      } catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).json({ message: "Error deleting task", error });
      }
    });

    // ✅ Reorder Tasks (Drag & Drop)
    app.put("/tasks/reorder", async (req, res) => {
      const { tasks } = req.body;
      console.log("Reordering tasks:", tasks);
      if (!Array.isArray(tasks)) return res.status(400).json({ message: "Invalid format" });

      try {
        const bulkUpdates = tasks.map((task, index) => ({
          updateOne: {
            filter: { _id: new ObjectId(task._id), userId: req.user.uid },
            update: { $set: { order: index } },
          },
        }));

        await tasksCollection.bulkWrite(bulkUpdates);
        io.emit("tasksReordered", tasks);
        console.log("Tasks reordered successfully");
        res.json({ message: "Tasks reordered successfully" });
      } catch (error) {
        console.error("Error reordering tasks:", error);
        res.status(500).json({ message: "Error reordering tasks", error });
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

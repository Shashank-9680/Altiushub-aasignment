import mongoose from "mongoose";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import { mkdir } from "fs/promises";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
mongoose
  .connect(
    "mongodb+srv://shashankagrawal696:Hp9IORVkx1gT6fUU@cluster0.hkrt4.mongodb.net/?retryWrites=true&w=majority&",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => console.log("MongoDb Connected"))
  .catch(() => console.log("MongoDb connection:", err));
// console.log(`MongoDB Connected:${connectDb.connection.host}`);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minLenth: 3,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    profilePicture: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      maxLength: 500,
      default: "",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
const User = mongoose.model("User", userSchema);

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["TODO", "InProcess", "Completed"],
      default: "TODO",
    },
    dueDate: {
      type: Date,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "true",
      required: true,
    },
    attachments: [
      {
        filename: String,
        path: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);
const Task = mongoose.model("Task", taskSchema);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "upload/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });
const auththenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }
  jwt.verify(token, MYNAME, (err, user) => {
    if (err) {
      return res.json(403).json({ message: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fiels are required" });
    }
    const userExist = await User.findOne({ $or: [{ email }, { username }] });
    if (userExist) {
      return res.status(400).json({ message: "User already exist" });
    }
    const user = new User({
      username,
      email,
      password,
    });
    await user.save();
    const token = jwt.sign(
      {
        id: user._id,
      },
      MYNAME,
      { expiresIn: "24h" }
    );
    res.status(201).json({
      message: "User resgistered successfully",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error registering user", error: error.message });
  }
});
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ mesage: "Invalid credentials" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ mesage: "Invalid Password" });
    }
    const token = jwt.sign({ id: user._id }, MYNAME, {
      expiresIn: "24h",
    });
    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error logging in", error: error.mesage });
  }
});

app.get("/api/profile", auththenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ mesage: "Error in profile", error: error.message });
  }
});
app.post(
  "/api/profile",
  auththenticateToken,
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      const { username, bio } = req.body;
      const updateData = { username, bio };
      if (req.file) {
        updateData.profilePicture = req.file.path;
      }
      const user = await User.findByIdAndUpdate(req.user._id, updateData, {
        new: true,
        select: "-password",
      });
      res.json(user);
    } catch (error) {
      res
        .status(500)
        .json({ mesage: "Error in updating", error: error.message });
    }
  }
);

app.post(
  "/api/tasks",
  auththenticateToken,
  upload.array("attachments"),
  async (req, res) => {
    try {
      const { title, description, priority, dueDate } = req.body;
      const attachments =
        req.file?.map((file) => ({
          filename: file.originalname,
          path: file.path,
        })) || [];
      const task = new Task({
        title: description,
        priority,
        dueDate,
        createdBy: req.user.id,
        attachments,
      });
      await task.save();
      res.status(281).json(task);
    } catch (error) {
      res
        .status(500)
        .json({ message: "error in creating task", error: error.mesage });
    }
  }
);

app.get("/api/tasks", auththenticateToken, async (req, res) => {
  try {
    const tasks = await Task.find({ createdBy: req.user.id })
      .populate("assignedTo", "username email")
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res
      .status(500)
      .json({ message: "error fetching tasks", error: error.mesage });
  }
});
app.put("/api/tasks/:id", auththenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, assignedTo } = req.body;
    const task = await Task.findOneAndUpdate(
      { _id: id, createdBy: req.user.id },
      { status: priority, assignedTo },
      { new: true }
    ).populate("assignedTo", "username email");
    if (!task) {
      return res.status(404).json({ meesage: "Task not found" });
    }
    res.json(task);
  } catch (error) {
    res
      .json(500)
      .json({ message: "Error updating task", error: error.message });
  }
});

try {
  await mkdir("uploads");
} catch (error) {
  if (error.code !== "EEXIST") {
    console.log("ERROR in uploading directories", error);
  }
}

const PORT = 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

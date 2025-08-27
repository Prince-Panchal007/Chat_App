const express = require('express');
const cors = require('cors');
const cp = require('cookie-parser');
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors({ origin: "*", credentials: true }));
app.use(cp());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

mongoose.connect('mongodb://localhost:27017/my-chat', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

// User Schema
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    socket: { type: String, required: true },
    name: { type: String, default: '' }
});

const User = mongoose.model("User", userSchema);

// Group Schema
const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    participants: [{ type: String, required: true }], // array of email addresses
    admin: { type: String, required: true }, // admin email
    createdAt: { type: Date, default: Date.now }
});

const Group = mongoose.model("Group", groupSchema);

// Group Message Schema
const groupMessageSchema = new mongoose.Schema({
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    sender: { type: String, required: true }, // sender email
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);

// Create HTTP server
const server = http.createServer(app);

// Attach Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*", // for testing; restrict in production
        methods: ["GET", "POST"]
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate a unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow all file types
        cb(null, true);
    }
});

// ... existing mongoose schemas and models ...

// Add file upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const { sender, receiver } = req.body;
        if (!sender || !receiver) {
            // Clean up the uploaded file if request is invalid
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, message: 'Sender and receiver are required' });
        }

        // Return file information
        res.json({
            success: true,
            message: 'File uploaded successfully',
            fileUrl: `http://localhost:5000/uploads/${req.file.filename}`,
            originalName: req.file.originalname,
            size: req.file.size,
            type: req.file.mimetype
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, message: 'File upload failed' });
    }
});

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

// Store connected users: email -> socketId
var users = {};
let onlineUsers = {};

// Socket.IO connection
io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);
    console.log("Active sockets:", [...io.sockets.sockets.keys()]);

    // Register user
    socket.on("register-user", async (email) => {
        users[email] = socket.id;
        console.log(`User registered: ${email} -> ${socket.id}`);

        if (email != 'No email found') {
            await User.findOneAndUpdate(
                { email },
                { $set: { email, socket: socket.id } },
                { upsert: true, new: true }
            );
        }

        console.log('===============================================');
        onlineUsers[email] = socket.id;
        io.emit("online-users", Object.keys(onlineUsers));
        console.log('Online users:', onlineUsers);
        console.log('===============================================');
    });

    // Handle send-message (individual chat)
    socket.on("send-message", ({ selected, message, from }) => {
        if (!selected || !message || !from) {
            socket.emit("message-status", { status: "failed", reason: "Missing fields" });
            return;
        }

        const recipientSocketId = users[selected];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("receive-message", { from, message });
            socket.emit("message-status", { status: "sent" });
        } else {
            socket.emit("message-status", { status: "failed", reason: "Recipient not online" });
        }
    });

    // Handle create-group
    socket.on("create-group", async ({ name, description, participants, admin }) => {
        try {
            if (!name || !participants || participants.length === 0 || !admin) {
                socket.emit("group-error", { message: "Missing required fields" });
                return;
            }

            // Add admin to participants if not already included
            if (!participants.includes(admin)) {
                participants.push(admin);
            }

            const newGroup = new Group({
                name,
                description: description || '',
                participants,
                admin
            });

            const savedGroup = await newGroup.save();

            // Emit to all participants
            participants.forEach(participantEmail => {
                const participantSocketId = users[participantEmail];
                if (participantSocketId) {
                    io.to(participantSocketId).emit("new-group", savedGroup);
                }
            });

            console.log(`Group created: ${name} with ${participants.length} participants`);
        } catch (error) {
            console.error('Error creating group:', error);
            socket.emit("group-error", { message: "Failed to create group" });
        }
    });

    // Handle get-user-groups
    socket.on("get-user-groups", async (userEmail) => {
        try {
            const groups = await Group.find({ participants: userEmail });
            socket.emit("user-groups", groups);
        } catch (error) {
            console.error('Error fetching user groups:', error);
            socket.emit("group-error", { message: "Failed to fetch groups" });
        }
    });

    // Handle send-group-message
    socket.on("send-group-message", async ({ groupId, message, from }) => {
        try {
            if (!groupId || !message || !from) {
                socket.emit("message-status", { status: "failed", reason: "Missing fields" });
                return;
            }

            // Verify group exists and user is participant
            const group = await Group.findById(groupId);
            if (!group) {
                socket.emit("message-status", { status: "failed", reason: "Group not found" });
                return;
            }

            if (!group.participants.includes(from)) {
                socket.emit("message-status", { status: "failed", reason: "Not a group participant" });
                return;
            }

            // Save message to database
            const groupMessage = new GroupMessage({
                groupId,
                sender: from,
                message
            });
            await groupMessage.save();

            // Send message to all participants
            group.participants.forEach(participantEmail => {
                const participantSocketId = users[participantEmail];
                if (participantSocketId) {
                    io.to(participantSocketId).emit("receive-group-message", {
                        groupId,
                        from,
                        message,
                        timestamp: new Date().toISOString()
                    });
                }
            });

            socket.emit("message-status", { status: "sent" });
            console.log(`Group message sent in ${group.name}: ${message}`);

        } catch (error) {
            console.error('Error sending group message:', error);
            socket.emit("message-status", { status: "failed", reason: "Server error" });
        }
    });

    // Handle get-group-messages
    socket.on("get-group-messages", async (groupId) => {
        try {
            const messages = await GroupMessage.find({ groupId })
                .sort({ timestamp: 1 })
                .limit(50); // Limit to last 50 messages

            const formattedMessages = messages.map(msg => ({
                id: `m${msg._id}`,
                senderId: msg.sender,
                senderName: msg.sender,
                text: msg.message,
                timestamp: msg.timestamp.toISOString()
            }));

            socket.emit("group-messages", { groupId, messages: formattedMessages });
        } catch (error) {
            console.error('Error fetching group messages:', error);
            socket.emit("group-error", { message: "Failed to fetch messages" });
        }
    });

    // Handle add-group-members
    socket.on("add-group-members", async ({ groupId, newMembers, adminEmail }) => {
        try {
            const group = await Group.findById(groupId);
            if (!group) {
                socket.emit("group-error", { message: "Group not found" });
                return;
            }

            if (group.admin !== adminEmail) {
                socket.emit("group-error", { message: "Only admin can add members" });
                return;
            }

            // Filter out members who are already in the group
            const membersToAdd = newMembers.filter(member => !group.participants.includes(member));

            if (membersToAdd.length === 0) {
                socket.emit("group-error", { message: "All selected users are already members" });
                return;
            }

            // Add new members
            group.participants.push(...membersToAdd);
            await group.save();

            // Notify all participants (including new ones) about the update
            group.participants.forEach(participantEmail => {
                const participantSocketId = users[participantEmail];
                if (participantSocketId) {
                    io.to(participantSocketId).emit("group-updated", group);
                }
            });

            console.log(`Added ${membersToAdd.length} members to group: ${group.name}`);
        } catch (error) {
            console.error('Error adding members:', error);
            socket.emit("group-error", { message: "Failed to add members" });
        }
    });

    // Handle remove-group-member
    socket.on("remove-group-member", async ({ groupId, memberToRemove, adminEmail }) => {
        try {
            const group = await Group.findById(groupId);
            if (!group) {
                socket.emit("group-error", { message: "Group not found" });
                return;
            }

            if (group.admin !== adminEmail) {
                socket.emit("group-error", { message: "Only admin can remove members" });
                return;
            }

            if (!group.participants.includes(memberToRemove)) {
                socket.emit("group-error", { message: "User is not a member of this group" });
                return;
            }

            if (memberToRemove === group.admin) {
                socket.emit("group-error", { message: "Cannot remove admin from group" });
                return;
            }

            // Remove member
            group.participants = group.participants.filter(p => p !== memberToRemove);
            await group.save();

            // Notify the removed member
            const removedMemberSocketId = users[memberToRemove];
            if (removedMemberSocketId) {
                io.to(removedMemberSocketId).emit("member-removed", { groupId, removedMember: memberToRemove });
            }

            // Notify remaining participants
            group.participants.forEach(participantEmail => {
                const participantSocketId = users[participantEmail];
                if (participantSocketId) {
                    io.to(participantSocketId).emit("group-updated", group);
                }
            });

            console.log(`Removed ${memberToRemove} from group: ${group.name}`);
        } catch (error) {
            console.error('Error removing member:', error);
            socket.emit("group-error", { message: "Failed to remove member" });
        }
    });

    // Handle update-group
    socket.on("update-group", async ({ groupId, name, description, adminEmail }) => {
        try {
            const group = await Group.findById(groupId);
            if (!group) {
                socket.emit("group-error", { message: "Group not found" });
                return;
            }

            if (group.admin !== adminEmail) {
                socket.emit("group-error", { message: "Only admin can update group" });
                return;
            }

            // Update group details
            group.name = name;
            group.description = description;
            await group.save();

            // Notify all participants
            group.participants.forEach(participantEmail => {
                const participantSocketId = users[participantEmail];
                if (participantSocketId) {
                    io.to(participantSocketId).emit("group-updated", group);
                }
            });

            console.log(`Group updated: ${group.name}`);
        } catch (error) {
            console.error('Error updating group:', error);
            socket.emit("group-error", { message: "Failed to update group" });
        }
    });

    // Handle delete-group
    socket.on("delete-group", async ({ groupId, adminEmail }) => {
        try {
            const group = await Group.findById(groupId);
            if (!group) {
                socket.emit("group-error", { message: "Group not found" });
                return;
            }

            if (group.admin !== adminEmail) {
                socket.emit("group-error", { message: "Only admin can delete group" });
                return;
            }

            // Delete all group messages
            await GroupMessage.deleteMany({ groupId });

            // Notify all participants before deletion
            group.participants.forEach(participantEmail => {
                const participantSocketId = users[participantEmail];
                if (participantSocketId) {
                    io.to(participantSocketId).emit("group-deleted", groupId);
                }
            });

            // Delete the group
            await Group.findByIdAndDelete(groupId);

            console.log(`Group deleted: ${group.name}`);
        } catch (error) {
            console.error('Error deleting group:', error);
            socket.emit("group-error", { message: "Failed to delete group" });
        }
    });

    // Handle leave-group
    socket.on("leave-group", async ({ groupId, memberEmail }) => {
        try {
            const group = await Group.findById(groupId);
            if (!group) {
                socket.emit("group-error", { message: "Group not found" });
                return;
            }

            if (!group.participants.includes(memberEmail)) {
                socket.emit("group-error", { message: "You are not a member of this group" });
                return;
            }

            if (memberEmail === group.admin) {
                socket.emit("group-error", { message: "Admin cannot leave group. Transfer ownership or delete the group." });
                return;
            }

            // Remove member
            group.participants = group.participants.filter(p => p !== memberEmail);
            await group.save();

            // Notify the leaving member
            const leavingMemberSocketId = users[memberEmail];
            if (leavingMemberSocketId) {
                io.to(leavingMemberSocketId).emit("member-removed", { groupId, removedMember: memberEmail });
            }

            // Notify remaining participants
            group.participants.forEach(participantEmail => {
                const participantSocketId = users[participantEmail];
                if (participantSocketId) {
                    io.to(participantSocketId).emit("group-updated", group);
                }
            });

            console.log(`${memberEmail} left group: ${group.name}`);
        } catch (error) {
            console.error('Error leaving group:', error);
            socket.emit("group-error", { message: "Failed to leave group" });
        }
    });

    socket.on("send-file", ({ selected, fileInfo, from, to }) => {
        if (!selected || !fileInfo || !from) {
            socket.emit("message-status", { status: "failed", reason: "Missing fields" });
            return;
        }

        const recipientSocketId = users[selected];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("receive-file", { from, fileInfo, to });
            socket.emit("message-status", { status: "sent" });
        } else {
            socket.emit("message-status", { status: "failed", reason: "Recipient not online" });
        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        // Remove from users list
        for (let email in users) {
            if (users[email] === socket.id) {
                delete users[email];
                break;
            }
        }
        for (let email in onlineUsers) {
            if (onlineUsers[email] === socket.id) {
                delete onlineUsers[email];
                break;
            }
        }
        io.emit("online-users", Object.keys(onlineUsers));
    });
});

// Routes
app.get("/", (req, res) => {
    res.send("Server is running!");
});

app.get('/register-email-user', (req, res) => {
    var email = req.query.email;
    res.cookie('email', email);
    res.cookie('is_login', true);
    res.redirect('http://localhost:3000/otp/');
});

app.get('/fetch-data', async (req, res) => {
    const data = await User.find({}, { email: 1, socket: 1, _id: 0 });
    users = data.reduce((acc, doc) => {
        acc[doc.email] = doc.socket;
        return acc;
    }, {});
    res.json(users);
});

// New route to get all users for group creation
app.get('/users', async (req, res) => {
    try {
        const users = await User.find({}, { email: 1, name: 1, _id: 0 });
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get user's groups
app.get('/user-groups/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const groups = await Group.find({ participants: email });
        res.json(groups);
    } catch (error) {
        console.error('Error fetching user groups:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// Get group messages
app.get('/group-messages/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        const messages = await GroupMessage.find({ groupId })
            .sort({ timestamp: 1 })
            .limit(50);

        const formattedMessages = messages.map(msg => ({
            id: `m${msg._id}`,
            senderId: msg.sender,
            senderName: msg.sender,
            text: msg.message,
            timestamp: msg.timestamp.toISOString()
        }));

        res.json({ success: true, messages: formattedMessages });
    } catch (error) {
        console.error('Error fetching group messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Start server
server.listen(5000, () => {
    console.log("✅ Server listening on http://localhost:5000");
});



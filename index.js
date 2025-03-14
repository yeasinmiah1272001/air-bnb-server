const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const stripe = require("stripe")(process.env.SECRET_KEY);

const cookieParser = require("cookie-parser");
const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  Timestamp,
} = require("mongodb");
const jwt = require("jsonwebtoken");

const port = process.env.PORT || 8000;

// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log(token);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access!" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qlvqjvw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const roomsCollection = client.db("airBnb").collection("rooms");
    const userCollection = client.db("airBnb").collection("users");
    const bookingCollections = client.db("airBnb").collection("bookings");

    // veryfy admin
    const veryfyAdmin = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const result = await userCollection.findOne(query);
      if (!result || result?.role !== "admin") {
        return res.status(401).send({ message: "unautheized access!!" });
      }
      next();
    };

    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      // console.log("took ", token);
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
        console.log("Logout successful");
      } catch (err) {
        res.status(500).send(err);
      }
    });

    app.put("/user", async (req, res) => {
      const user = req.body;
      console.log("hellow");
      const query = { email: user.email };
      const isExist = await userCollection.findOne({ email: user?.email });
      if (isExist) {
        if (user?.status === "Requested") {
          const result = await userCollection.updateOne(query, {
            $set: { status: user.status },
          });
          res.send(result);
        } else {
          return res.send(isExist);
        }
      } else {
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            ...user,
            timestamp: Date.now(),
          },
        };

        const result = await userCollection.updateOne(
          query,
          updateDoc,
          options
        );
        // console.log("User updated:", result);
        res.send(result);
      }
    });

    // get all users

    app.get("/users", verifyToken, veryfyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // get user by email db
    app.get("/user/:email", async (req, res) => {
      const user = req.body;
      const email = req.params.email;
      // const query = { email };
      const result = await userCollection.findOne({ email });
      res.send(result);
    });

    // user role update
    app.patch("/user/update/:email", async (req, res) => {
      const user = req.body;
      const email = req.params.email;
      const query = { email };
      const updateDoc = { $set: { ...user, timestamp: Date.now() } };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // get All rooms
    app.get("/rooms", async (req, res) => {
      const category = req.query.category;
      let query = {};
      if (category && category !== "null") {
        query = {
          category,
        };
      }
      const result = await roomsCollection.find(query).toArray();
      res.send(result);
    });

    // get single data by id
    app.get("/room/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await roomsCollection.findOne(query);
      res.send(result);
    });

    // save all room database post request
    app.post("/room", async (req, res) => {
      const roomData = req.body;
      const result = await roomsCollection.insertOne(roomData);
      res.send(result);
    });
    // get all room by host
    app.get("/my-listings/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "host.email": email };
      const result = await roomsCollection.find(query).toArray();
      res.send(result);
    });
    app.delete("/room/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await roomsCollection.deleteOne(query);
      res.send(result);
    });

    // payment
    // create-payment-intent
    app.post("/create-payment-intent", async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;
      if (!price || priceInCent < 1) return;
      // generate clientSecret
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        automatic_payment_methods: {
          enabled: true,
        },
      });
      // send client secret as response
      res.send({ clientSecret: client_secret });
    });

    // save payment booking

    app.post("/booking", async (req, res) => {
      const booningData = req.body;
      const result = await bookingCollections.insertOne(booningData);
      res.send(result);
    });

    // update room status
    app.patch("/room/status/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { booked: status },
      };
      const result = await roomsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from StayVista Server..");
});

app.listen(port, () => {
  console.log(`StayVista is running on port ${port}`);
});

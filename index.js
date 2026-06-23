const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

// Load Environment Variables
dotenv.config();

const app = express();
const port = process.env.PORT;

// ========================================================
// Global Middleware
// ========================================================
app.use(cors());
app.use(express.json());

// MongoDB Connection Configuration
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Establish database connection
    // await client.connect();
    console.log("Successfully connected to MongoDB!");

    // Database & Collections Scope
    const db = client.db("pet-adoption");
    const petsCollection = db.collection("pets");
    const requestsCollection = db.collection("adoptionRequests");

    // ========================================================
    // 1. PETS LOGIC (CRUD operations)
    // ========================================================

    // POST: Add a New Pet (Used by AddPet Form)
    app.post("/pets", async (req, res) => {
      try {
        const petData = req.body;

        const result = await petsCollection.insertOne({
          ...petData,
          adopted: false, // Initial status is always false
          createdAt: new Date(),
        });

        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to add pet listing", error: error.message });
      }
    });

    // PUBLIC GET: Fetch All Available Pets (For Explore Page)
    // app.get("/public-pets", async (req, res) => {
    try {
      // Only fetch pets where adopted is false so users don't apply for taken pets
      const query = { adopted: false };
      const result = await petsCollection.find(query).toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch public listings", error: error.message });
    }
  });

  // GET: Fetch Pets Added by a Specific Owner (For Owner's Dashboard Listing)
  app.get("/pets/owner/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const query = { ownerEmail: email };

      const result = await petsCollection.find(query).toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch user listings", error: error.message });
    }
  });

  // GET: Fetch a Single Pet Profile by ID (For Details or Editing)
  app.get("/pets/:id", async (req, res) => {
    try {
      const id = req.params.id;

      if (id.length !== 24) {
        return res.status(400).send({ message: "Invalid hex ID format structure" });
      }

      const query = { _id: new ObjectId(id) };
      const result = await petsCollection.findOne(query);

      if (!result) {
        return res.status(404).send({ message: "Pet document not found" });
      }
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: "Internal server read error", error: error.message });
    }
  });

  // PATCH: Modify/Update an Existing Pet Profile
  app.patch("/pets/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedPetData = req.body;

      const updateDoc = {
        $set: {
          petName: updatedPetData.petName,
          species: updatedPetData.species,
          breed: updatedPetData.breed,
          age: Number(updatedPetData.age),
          gender: updatedPetData.gender,
          image: updatedPetData.image,
          healthStatus: updatedPetData.healthStatus,
          vaccinationStatus: updatedPetData.vaccinationStatus,
          location: updatedPetData.location,
          adoptionFee: Number(updatedPetData.adoptionFee),
          description: updatedPetData.description,
        },
      };

      const result = await petsCollection.updateOne(filter, updateDoc);
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: "Failed to update pet data document", error: error.message });
    }
  });

  // DELETE: Remove a Pet Listing entirely
  app.delete("/pets/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await petsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: "Failed to delete pet", error: error.message });
    }
  });


  // ========================================================
  // 2. ADOPTION REQUESTS LOGIC
  // ========================================================

  // POST: Submit a New Pet Adoption Application
  app.post("/adoptions", async (req, res) => {
    try {
      const requestData = req.body; // Expects: petId, requesterEmail, message

      // 1. Check if the targeted pet exists
      const pet = await petsCollection.findOne({ _id: new ObjectId(requestData.petId) });
      if (!pet) {
        return res.status(404).send({ message: "Pet not found" });
      }

      // 2. Guard rail: Don't let users adopt their own pet
      if (pet.ownerEmail === requestData.requesterEmail) {
        return res.status(400).send({ message: "You cannot adopt your own pet" });
      }

      // 3. Guard rail: Don't allow applications for already adopted pets
      if (pet.adopted) {
        return res.status(400).send({ message: "This pet has already been adopted" });
      }

      // 4. Guard rail: Check if this user already applied for this pet
      const existingRequest = await requestsCollection.findOne({
        petId: requestData.petId,
        requesterEmail: requestData.requesterEmail,
      });
      if (existingRequest) {
        return res.status(400).send({ message: "You have already requested this pet" });
      }

      // 🌟 FIX: Inject pet meta information dynamically into the request document. 
      // This ensures tracking works perfectly for dashboard queries without frontend payload bloatedness.
      const result = await requestsCollection.insertOne({
        ...requestData,
        ownerEmail: pet.ownerEmail, // Tied to listings page owner context
        petName: pet.petName,       // Makes it easier to read on UI without extra fetching
        status: "pending",
        createdAt: new Date(),
      });

      res.status(201).send(result);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // GET: Fetch Requests meant ONLY for the Current Listing Owner (Dashboard Context)
  app.get("/adoptions/owner/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const result = await requestsCollection.find({ ownerEmail: email }).toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch owner requests", error: error.message });
    }
  });

  // GET: Fetch Applications submitted BY a User (Their outgoing application tracker page)
  app.get("/adoptions/user/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const query = { requesterEmail: email };

      const result = await requestsCollection.find(query).toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: "Failed to retrieve user applications", error: error.message });
    }
  });

  // PATCH: Approve an Adoption Request (Locks the pet, auto-rejects others)
  app.patch("/adoptions/:id/approve", async (req, res) => {
    try {
      const id = req.params.id;

      const request = await requestsCollection.findOne({ _id: new ObjectId(id) });
      if (!request) {
        return res.status(404).send({ message: "Request not found" });
      }

      // 1. Approve selected application
      await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approved" } }
      );

      // 2. Mark corresponding pet status as adopted
      await petsCollection.updateOne(
        { _id: new ObjectId(request.petId) },
        { $set: { adopted: true } }
      );

      // 3. Automatically reject all other pending applications for this specific pet
      await requestsCollection.updateMany(
        {
          petId: request.petId,
          _id: { $ne: new ObjectId(id) },
        },
        { $set: { status: "rejected" } }
      );

      res.send({ success: true, message: "Request approved. Other applicants rejected automatically." });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // PATCH: Reject an Adoption Request manually
  app.patch("/adoptions/:id/reject", async (req, res) => {
    try {
      const id = req.params.id;

      const result = await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "rejected" } }
      );

      res.send(result);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // DELETE: Cancel and Remove an Application Row entry
  app.delete("/adoptions/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await requestsCollection.deleteOne(query);
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: "Failed to clear request reference entry", error: error.message });
    }
  });

} catch (error) {
  console.error("Database connection failure log details:", error);
}
}

// Instantiate internal process listener execution
run().catch(console.dir);

// Root Diagnostics Verification Route
app.get("/", (req, res) => {
  res.send("Pet Adoption Server Running");
});

// Bind Active App Event Listener Configuration
// app.listen(port, () => {
//   console.log(`Server running on port ${port}`);
// });
module.exports = app;
const router = require('express').Router();
const User = require("..//models/User");
const Watinglist = require('../models/Watinglist');

// router.post("/wating/list", async (req, res) => {
//   try {
//     const email = req.body.email;

//     // Check if email already exists
//     const isExist = await Watinglist.findOne({ email: email });
//     if (isExist) {
//       return res.status(200).json({ message: "You already registered for waitlist" });
//     }

//     // Create and save new waiting list entry
//     const watinglist = new Watinglist({ email: email });
//     console.log("Request received");
//     await watinglist.save();

//     return res.status(200).json(watinglist);
//   } catch (err) {
//     console.error("Error in waitlist post:", err);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// });


module.exports = router

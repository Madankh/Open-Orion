const mongoose = require("mongoose");
const WatinglistSchema = new mongoose.Schema(
    {
        email:{
            type:String,
            required:true,
            unique:true
        }, 
        username:{
            type:String,
        }

    }, {timestamps:true}
);


module.exports = mongoose.model("Watinglist" , WatinglistSchema)

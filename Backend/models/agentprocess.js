const mongoose = require("mongoose");

const VideoSchema = new mongoose.Schema({
        user:{
          type:mongoose.Schema.Types.ObjectId,
          required:true,
          ref:"User"
        },
        Video:{
                    type:Array,
                    require:false
        },
        audio:{
                    type:Array,
                    require:false
        },
        Content:{
            type:String,
            require:false
        },
        sound_effect:{
          type:Array,
          require:false
      }
},{timestamps:true})

module.exports = mongoose.model("Video" , VideoSchema);
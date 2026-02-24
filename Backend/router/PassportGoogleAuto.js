const passport = require("passport");
const User = require("../models/User")
const  GoogleStrategy = require('passport-google-oauth20').Strategy;

const dotenv = require("dotenv");
dotenv.config();
passport.use(new GoogleStrategy({
  clientID:process.env.GOOGLE_CLIENT_ID,
  clientSecret:process.env.GOOGLE_CLIENT_SEC,
  callbackURL: "http://localhost:5000/api/auth/google/callback",
  // callbackURL: "https://api.curiositylab.fun/api/auth/google/callback",
  scope:['profile' , 'email']
},
async (accessToken, refreshToken, profile, cb) => {
 const defaultUser = {
  username:`${profile.name.givenName}`,
  email:`${profile?._json.email}`,
  profile:`${profile?.photos[0].value}`,
  googleId:`${profile.id}`,
  verified:true
 }
  let  user = await User.findOne({email:profile._json.email});
  if(!user){
      user = await User.create(defaultUser);
      await user.save();
      cb(null , user)

  }else{
   cb(null, user);
  }
  
}
));

  


passport.serializeUser((user  , cb)=>{
    cb(null , user.id)
})

passport.deserializeUser(async(id  , cb)=>{
    const user = await User.findById(id).catch((err)=>{
      console.log("Error deserializing" , err);
      cb(err, null);
    });
   
    if(user) cb(null , user);
})

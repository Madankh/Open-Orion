const passport = require("passport")
const passportjwt = require("passport-jwt");
const ExtractJwt = passportjwt.ExtractJwt;
const StrategyJwt = passportjwt.Strategy;
const User = require('../models/User');


passport.use(
    new StrategyJwt(
        {
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey : process.env.SECRETACCESS,
        },
        function (jwtPayload , done){
            return User.findOne({$where:{id:jwtPayload.id}})
            .then((user)=>{
                return done(null, user);
            }).catch((err)=>
            {
                return done(err);
            });
        }
    )
);
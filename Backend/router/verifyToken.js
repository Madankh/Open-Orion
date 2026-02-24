const jwt = require("jsonwebtoken");
require("dotenv").config()
const verifyToken = (req , res , next)=>{ ///To verify user with it jwt token
        const authHeader = req.headers.token
        if(authHeader){
            const token = authHeader 
            jwt.verify(token , process.env.JWT_SEC , (err , user)=>{ //JWT token verify with JWT_SEC
                // console.log(token)
                if(err) return res.status(401).json("user Token is not valid so logout and login then try it.");
                req.user = user;
                next();
            })
        }else{
            return res.status(401).json("You are not authenticated!")
        }
}
const verifyTokenAndAuthorization = (req , res , next) =>{ ///To check req.user and params user are same if yes user is isAdmin or not if yes than process to do other things 

        verifyToken(req , res, ()=>{ //This is jwt token
            if(req.user.id === req.params.id || req.body.isAdmin){ //user and params and isAdmin are same or not if they are same than process it.
                next();
            }else{
               return res.status(403).json("You are not allowed to do this")
            }
        })
        
    
}
const verifyTokenAndAdmin = (req , res , next)=>{
    
        verifyToken(req , res,()=>{
            if(req.user.isAdmin){
                next();
            } else{
                return res.status(403).json("You are not allowed to do that!")
            }
        });
        
    
};
 

module.exports = {verifyToken , verifyTokenAndAuthorization , verifyTokenAndAdmin}



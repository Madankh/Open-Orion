exports.generateOTP = ()=>{
            let OTP = '';
            for(let i = 0; i<=3; i++){
                let ranval = Math.round(Math.random()*9)
                OTP = OTP+ranval
            }
            return OTP;
          }
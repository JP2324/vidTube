import jwt from "jsonwebtoken";
import {asyncHandler} from "express-async-handler";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.models.js";

// Protect routes middleware

export const verifyJWT = asyncHandler(async (req, _ ,next) => {
    const token = req.cookies.accessToken || req.header["Authorization"]?.replace("Bearer ","")
    if(!token){
        throw new ApiError(401,"Unauthorized , token not found")
    }
    try {
        const decodeToken = jwt.verify(token,process.env.ACCESS_TOKEN_SECRET)
        const user = await User.findById(decodeToken?._id).select("-password -refreshToken")
        if(!user){
            throw new ApiError(404,"User not found")
        }
        req.user = user // attaching user to req object
        next()
    } catch (error) {
        throw new ApiError(401,"Unauthorized , invalid access token")
    }
    
})
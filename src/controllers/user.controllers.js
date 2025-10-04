import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import { uploadOnCloudinary , deleteFromCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"

// Generate access token and refresh token
const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        if(!user){
            throw new ApiError(404,"User not found")
        }
        const accessToken  = user.generateAccessToken() // generate new refresh token
        const refreshToken  = user.generateRefreshToken() // generate new refresh token
    
        user.refreshToken = refreshToken // save new refresh token in db
        await user.save({validateBeforeSave:false})
        
        return {accessToken,refreshToken}
    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating tokens")
    }
}

// Register user controller
const registerUser = asyncHandler(async (req, res) => {
    // Registration logic here
    const  {fullName,email,username,password} = req.body
    
    //validation
    if(
        [fullName,email,username,password].some((field)=> field?.trim() === "")
    ){
        throw new ApiError(400,"All fields are required")
    }
    const existedUser = await User.findOne({
        $or: [{username},{email}]
    })
    if(existedUser){
        throw new ApiError(409,"User already exists")
    }

    //handle file upload
    console.warn(req.files)
    const avatarLocalPath = req.files?.avatar?.[0]?.path 
    const coverLocalPath = req.files?.coverImage?.[0]?.path 

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is required")
    }

    // const avatar = await uploadOnCloudinary(avatarLocalPath)
    // let coverImage = "" ;
    // if(coverLocalPath){
    //     coverImage = await uploadOnCloudinary(coverLocalPath)
    // }

    let avatar;
    try {
        avatar = await uploadOnCloudinary(avatarLocalPath)
        console.log("Uploaded avatar to cloudinary ",avatar);
    } catch (error) {
        console.log("Error while uploading avatar on cloudinary ",error);
        throw new ApiError(500,"Something went wrong while uploading avatar")
    }

    let coverImage;
    try {
        coverImage = await uploadOnCloudinary(coverLocalPath)
        console.log("Uploaded cover image to cloudinary ",coverImage);
    } catch (error) {
        console.log("Error while uploading coverimage on cloudinary ",error);
        throw new ApiError(500,"Something went wrong while uploading cover image")
    }


    try {
        const user = await User.create({
            fullname:fullName,
            avatar: avatar?.url,
            coverImage: coverImage?.url || "",
            email,
            username:username.toLowerCase(),
            password
        })
    
        const  createdUser = await User.findById(user._id).select(
            "-password -refreshToken"
        )
        if(!createdUser){
            throw new ApiError(500,"Something went wrong while registering user")
        }
        return res
        .status(201)
        .json(new ApiResponse(200,createdUser,"User registered successfully"))
    } catch (error) {
        console.log("User Creation failed ",error);
        if (avatar) {
            await deleteFromCloudinary(avatar.public_id);
        }else if (coverImage) {
            await deleteFromCloudinary(coverImage.public_id);
        }
        throw new ApiError(500,"Something went wrong while registering user and images were deleted")
    }


})

// Login user controller
const loginUser = asyncHandler(async (req, res) => {
    // get data from request body 
    const {email,username,password} = req.body
    //validation
    if(!email){
        throw new ApiError(400,"Email is required")
    }
    if(!password){
        throw new ApiError(400,"Password is required")
    }
    const user = await User.findOne({
        $or: [{username},{email}]
    })
    if(!user){
        throw new ApiError(404,"User not found")
    }
    //validate password
    const isPasswordValid=await user.isPasswordCorrect(password)
    if(!isPasswordValid){
        throw new ApiError(401,"Invalid credentials")
    }
    const {accessToken,refreshToken} = await generateAccessAndRefreshToken(user._id)
    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    
    const options ={
        httpOnly:true,
        secure : process.env.NODE_ENV === "production",
    }
    return res.status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(new ApiResponse(200,{user:loggedInUser,accessToken,refreshToken},"User logged in successfully"))

})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if(!incomingRefreshToken){
        throw new ApiError(401,"Refresh token is required")
    }
    
    try {
        const decodeToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
        const user =await User.findOne(decodeToken?._id) 
        if(!user){
            throw new ApiError(404,"Invalid refresh token - user not found")
        }
        if(user?.refreshToken !== incomingRefreshToken){
            throw new ApiError(401,"Invalid refresh token")
        }
        const option = {
            httpOnly:true,
            secure: process.env.NODE_ENV === "production"
        }
        const {accessToken,refreshToken:newRefreshToken} = await generateAccessAndRefreshToken(user._id)
        return res
        .status(200)
        .cookie("accessToken",accessToken,option)
        .cookie("refreshToken",newRefreshToken,option)
        .json(new ApiResponse(200,{accessToken,newRefreshToken},"Access token generated successfully"))

    } catch (error) {
        throw new ApiError(500,"Error while new refresh token")
    }

})

const logoutUser = asyncHandler(async (req, res) => { 
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken:undefined
            }
        } ,
        {new:true}
    )

    const options = {
        httpOnly:true,
        secure: process.env.NODE_ENV === "production",
    }

    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(200,{},"User logged out successfully"))
})

//CRUD OPERATIONS FOR LOGGED IN USER

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const {oldPassword,newPassword} = req.body
    if(!oldPassword?.trim() || !newPassword?.trim()){
        throw new ApiError(400,"Passwords not same")
    }
    const user = await User.findById(req.user._id)
    if(!user){
        throw new ApiError(404,"User not found")
    }

    const isPasswordValid = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordValid){
        throw new ApiError(401,"Old password is incorrect")
    }
    user.password = newPassword
    await user.save({validateBeforeSave:false})
    return res
    .status(200)
    .json(new ApiResponse(200,{},"Password changed successfully"))

})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json(new ApiResponse(200,req.user,"Current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    const {fullname,email} = req.body
    if(!fullname?.trim() || !email?.trim()){
        throw new ApiError(400,"Fullname and email are required")
    }
    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullname,
                email:email.toLowerCase()
            }
        },
        {new:true}
    ).select("-password -refreshToken")

    return res.status(200).json(new ApiResponse(200,user,"User details updated successfully"))

})

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path;
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is required")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if(!avatar?.url){
        throw new ApiError(500,"Something went wrong while uploading avatar")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {$set:{avatar:avatar?.url}},
        {new:true}
    ).select("-password -refreshToken")
    return res.status(200).json(new ApiResponse(200,user,"User avatar updated successfully"))
    
})


const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path;
    if(!coverImageLocalPath){
        throw new ApiError(400,"Cover image is required")
    }
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if(!coverImage?.url){
        throw new ApiError(500,"Something went wrong while uploading cover image")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {$set:{coverImage:coverImage?.url}},
        {new:true}
    ).select("-password -refreshToken")
    return res.status(200).json(new ApiResponse(200,user,"User cover image updated successfully"))
})


export { registerUser , loginUser , refreshAccessToken , logoutUser , getCurrentUser , changeCurrentPassword , updateAccountDetails , updateUserAvatar , updateUserCoverImage }
import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import { uploadOnCloudinary , deleteFromCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

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



export { registerUser , loginUser }
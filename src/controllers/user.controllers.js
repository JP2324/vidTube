import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import { uploadOnCloudinary , deleteFromCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

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

export { registerUser }
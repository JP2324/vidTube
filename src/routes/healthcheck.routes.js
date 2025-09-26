import {Router} from "express";
import { healthcheck } from "../controllers/healthcheck.controllers.js";

const router = Router()
// /api/v1/healthcheck/test

router.route("/").get(healthcheck)
router.route("/test").get(healthcheck) // the healthcheck(req,res,next)

export default router


import { Router, type IRouter } from "express";
import healthRouter from "./health";
import prescriptionsRouter from "./prescriptions";
import chatRouter from "./chat";
import authRouter from "./auth";
import voiceRouter from "./voice";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(prescriptionsRouter);
router.use(chatRouter);
router.use(voiceRouter);

export default router;

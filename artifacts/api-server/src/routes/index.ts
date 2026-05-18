import { Router, type IRouter } from "express";
import healthRouter from "./health";
import prescriptionsRouter from "./prescriptions";
import chatRouter from "./chat";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(prescriptionsRouter);
router.use(chatRouter);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import prescriptionsRouter from "./prescriptions";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(prescriptionsRouter);
router.use(chatRouter);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import prescriptionsRouter from "./prescriptions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(prescriptionsRouter);

export default router;

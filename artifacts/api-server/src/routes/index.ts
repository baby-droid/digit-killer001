import { Router, type IRouter } from "express";
import healthRouter from "./health";
import symbolsRouter from "./symbols";
import analysisRouter from "./analysis";
import adminRouter from "./admin";
import advancedRouter from "./advanced";

const router: IRouter = Router();

router.use(healthRouter);
router.use(symbolsRouter);
router.use(analysisRouter);
router.use(adminRouter);
router.use(advancedRouter);

export default router;

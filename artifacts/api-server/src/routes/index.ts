import { Router, type IRouter } from "express";
import healthRouter from "./health";
import symbolsRouter from "./symbols";
import analysisRouter from "./analysis";
import adminRouter from "./admin";
import advancedRouter from "./advanced";
import liveRouter from "./live";
import academyRouter from "./academy";
import derivOauthRouter from "./deriv-oauth";
import legacyTokenRouter from "./legacy-token";
import patTokenRouter from "./pat-token";

const router: IRouter = Router();

router.use(healthRouter);
router.use(symbolsRouter);
router.use(analysisRouter);
router.use(adminRouter);
router.use(advancedRouter);
router.use(liveRouter);
router.use(academyRouter);
router.use(derivOauthRouter);
router.use(legacyTokenRouter);
router.use(patTokenRouter);

export default router;

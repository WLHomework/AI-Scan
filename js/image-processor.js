class ImageProcessor {
    constructor() {
        this.SMOOTH_FACTOR = 0.7;
        this.MAX_HISTORY = 5;
        this.cornerHistory = Array(4).fill().map(() => []);
        this.kalmanFilters = Array(8).fill().map(() => new KalmanFilter());
        this.isRunning = false;
        this.errorCount = 0;
        this.MAX_ERRORS = 5;
        this.lastResetTime = Date.now();
        this.RESET_INTERVAL = 30000; // 30秒
    }

    reset() {
        console.log('重置ImageProcessor状态...');
        // 清除历史数据
        this.cornerHistory = Array(4).fill().map(() => []);
        // 重新初始化卡尔曼滤波器
        this.kalmanFilters = Array(8).fill().map(() => new KalmanFilter());
        this.errorCount = 0;
        this.lastResetTime = Date.now();
        console.log('ImageProcessor状态已重置');
    }

    checkAndReset() {
        const now = Date.now();
        if (now - this.lastResetTime > this.RESET_INTERVAL) {
            console.log('执行定期重置...');
            this.reset();
            return true;
        }
        return false;
    }

    smoothCorners(points) {
        for (let i = 0; i < 4; i++) {
            this.cornerHistory[i].push(points[i]);
            if (this.cornerHistory[i].length > this.MAX_HISTORY) {
                this.cornerHistory[i].shift();
            }
        }

        let smoothedPoints = points.map((point, index) => {
            let history = this.cornerHistory[index];
            if (history.length < 2) return point;

            let predictedX = this.kalmanFilters[index * 2].update(point.x);
            let predictedY = this.kalmanFilters[index * 2 + 1].update(point.y);

            let weight = 1;
            let sumX = 0;
            let sumY = 0;
            let totalWeight = 0;

            for (let i = history.length - 1; i >= 0; i--) {
                sumX += history[i].x * weight;
                sumY += history[i].y * weight;
                totalWeight += weight;
                weight *= this.SMOOTH_FACTOR;
            }

            sumX += predictedX * weight;
            sumY += predictedY * weight;
            totalWeight += weight;

            return {
                x: sumX / totalWeight,
                y: sumY / totalWeight
            };
        });

        return smoothedPoints;
    }

    validateCorners(points) {
        let distances = [];
        for (let i = 0; i < 4; i++) {
            let start = points[i];
            let end = points[(i + 1) % 4];
            let distance = Math.sqrt(
                Math.pow(end.x - start.x, 2) + 
                Math.pow(end.y - start.y, 2)
            );
            distances.push(distance);
        }

        let avgDistance = distances.reduce((a, b) => a + b, 0) / 4;
        let validDistances = distances.every(d => 
            d >= avgDistance * 0.5 && d <= avgDistance * 1.5
        );

        return validDistances;
    }

    calculateRectangularity(contour) {
        let area = cv.contourArea(contour);
        let rect = cv.boundingRect(contour);
        let rectArea = rect.width * rect.height;
        return area / rectArea;
    }

    calculateConvexity(contour) {
        let hull = new cv.Mat();
        cv.convexHull(contour, hull);
        let hullArea = cv.contourArea(hull);
        let contourArea = cv.contourArea(contour);
        hull.delete();
        return contourArea / hullArea;
    }

    calculateAngle(p1, p2, p3) {
        let v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
        let v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
        let dot = v1.x * v2.x + v1.y * v2.y;
        let mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        let mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        let angle = Math.acos(dot / (mag1 * mag2)) * 180 / Math.PI;
        return angle;
    }

    sortCorners(points) {
        let center = points.reduce((acc, point) => ({
            x: acc.x + point.x / 4,
            y: acc.y + point.y / 4
        }), { x: 0, y: 0 });

        let pointsWithAngles = points.map(point => ({
            point: point,
            angle: Math.atan2(point.y - center.y, point.x - center.x),
            distance: Math.sqrt(Math.pow(point.x - center.x, 2) + Math.pow(point.y - center.y, 2))
        }));

        pointsWithAngles.sort((a, b) => a.angle - b.angle);
        points = pointsWithAngles.map(p => p.point);

        let angles = [];
        for (let i = 0; i < 4; i++) {
            let angle = this.calculateAngle(points[i], points[(i + 1) % 4], points[(i + 2) % 4]);
            angles.push(angle);
        }

        if (angles.some(angle => angle < 80 || angle > 100)) {
            let bestIndex = 0;
            let minDiff = 90;
            for (let i = 0; i < 4; i++) {
                let diff = Math.abs(angles[i] - 90);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestIndex = i;
                }
            }
            points = [...points.slice(bestIndex), ...points.slice(0, bestIndex)];
        }

        return points;
    }

    processFrame(src) {
        try {
            console.log('[ImageProcessor] 开始处理帧...');
            
            // 验证输入图像
            if (!this.isRunning || !src || src.empty() || src.isDeleted()) {
                console.log('[ImageProcessor] 输入验证失败:', {
                    isRunning: this.isRunning,
                    hasSource: !!src,
                    isEmpty: src ? src.empty() : true,
                    isDeleted: src ? src.isDeleted() : true
                });
                return null;
            }

            // 创建输入图像的副本，避免修改原始图像
            let srcCopy = null;
            try {
                srcCopy = src.clone();
                if (srcCopy.empty()) {
                    throw new Error('无法克隆输入图像');
                }
            } catch (err) {
                console.error('[ImageProcessor] 克隆输入图像失败:', err);
                return null;
            }

            // 定期重置检查
            this.checkAndReset();

            let mats = {
                dst: null,
                gray: null,
                bilateral: null,
                binary: null,
                edges: null,
                contours: null,
                hierarchy: null,
                kernel: null,
                closeKernel: null
            };

            try {
                // 创建目标图像
                mats.dst = srcCopy.clone();
                
                // 转换为灰度图
                mats.gray = new cv.Mat();
                cv.cvtColor(srcCopy, mats.gray, cv.COLOR_RGBA2GRAY);

                // 双边滤波
                mats.bilateral = new cv.Mat();
                cv.bilateralFilter(mats.gray, mats.bilateral, 9, 75, 75);

                // 中值滤波和高斯模糊
                cv.medianBlur(mats.bilateral, mats.bilateral, 7);
                cv.GaussianBlur(mats.bilateral, mats.bilateral, new cv.Size(5, 5), 0);

                // 自适应阈值处理
                mats.binary = new cv.Mat();
                cv.adaptiveThreshold(mats.bilateral, mats.binary, 255, 
                    cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 15, 5);

                // 形态学操作
                mats.kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
                cv.morphologyEx(mats.binary, mats.binary, cv.MORPH_OPEN, mats.kernel);

                // Canny边缘检测
                mats.edges = new cv.Mat();
                cv.Canny(mats.binary, mats.edges, 50, 150);

                // 形态学闭操作
                mats.closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
                cv.morphologyEx(mats.edges, mats.edges, cv.MORPH_CLOSE, mats.closeKernel);
                cv.dilate(mats.edges, mats.edges, mats.closeKernel);

                // 查找轮廓
                mats.contours = new cv.MatVector();
                mats.hierarchy = new cv.Mat();
                cv.findContours(mats.edges, mats.contours, mats.hierarchy, 
                    cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

                // 查找最佳轮廓
                let bestContour = this.findBestContour(mats.contours);
                let result = {
                    original: mats.dst.clone(),
                    transformed: mats.dst.clone()
                };

                if (bestContour) {
                    try {
                        let points = this.getCornerPoints(bestContour);
                        if (points && points.length === 4) {
                            this.drawCornersAndLines(result.original, points);
                            let transformed = this.applyPerspectiveTransform(srcCopy, points);
                            if (transformed && !transformed.empty()) {
                                result.transformed.delete();
                                result.transformed = transformed;
                            }
                        }
                    } catch (err) {
                        console.error('[ImageProcessor] 处理轮廓时出错:', err);
                        this.errorCount++;
                    }
                }

                this.errorCount = 0;
                return result;

            } finally {
                // 释放所有Mat对象
                srcCopy.delete();
                Object.values(mats).forEach(mat => {
                    if (mat && !mat.isDeleted()) {
                        try {
                            mat.delete();
                        } catch (err) {
                            console.error('[ImageProcessor] 释放Mat对象时出错:', err);
                        }
                    }
                });
            }
        } catch (err) {
            console.error('[ImageProcessor] processFrame出错:', 
                typeof err === 'number' ? `错误代码: ${err}` : err);
            this.errorCount++;
            return null;
        }
    }

    findBestContour(contours) {
        if (!contours || contours.size() === 0) {
            return null;
        }

        let bestContour = null;
        let bestScore = 0;
        
        for (let i = 0; i < contours.size(); i++) {
            let contour = contours.get(i);
            if (!contour || contour.empty()) continue;

            try {
                let area = cv.contourArea(contour);
                if (area < 1000) continue;
                
                let rectangularity = this.calculateRectangularity(contour);
                let convexity = this.calculateConvexity(contour);
                
                let score = area * rectangularity * convexity;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestContour = contour;
                }
            } catch (err) {
                console.error('[ImageProcessor] 处理轮廓时出错:', err);
                continue;
            }
        }
        
        return bestContour;
    }

    getCornerPoints(contour) {
        let epsilon = 0.02 * cv.arcLength(contour, true);
        let approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, epsilon, true);
        
        let points = [];
        for (let i = 0; i < 4; i++) {
            points.push({
                x: approx.data32S[i * 2],
                y: approx.data32S[i * 2 + 1]
            });
        }
        
        approx.delete();
        return this.sortCorners(points);
    }

    drawCornersAndLines(dst, points) {
        const green = new cv.Scalar(0, 255, 0, 255);
        
        // 绘制角点
        for (let point of points) {
            cv.circle(dst, new cv.Point(point.x, point.y), 8, green, -1);
        }
        
        // 绘制连线
        for (let i = 0; i < 4; i++) {
            let start = points[i];
            let end = points[(i + 1) % 4];
            cv.line(dst, new cv.Point(start.x, start.y), new cv.Point(end.x, end.y), green, 3);
        }
    }

    applyPerspectiveTransform(src, points) {
        let width = Math.max(
            Math.sqrt(Math.pow(points[1].x - points[0].x, 2) + Math.pow(points[1].y - points[0].y, 2)),
            Math.sqrt(Math.pow(points[2].x - points[3].x, 2) + Math.pow(points[2].y - points[3].y, 2))
        );
        
        let height = Math.max(
            Math.sqrt(Math.pow(points[3].x - points[0].x, 2) + Math.pow(points[3].y - points[0].y, 2)),
            Math.sqrt(Math.pow(points[2].x - points[1].x, 2) + Math.pow(points[2].y - points[1].y, 2))
        );
        
        let srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
            points[0].x, points[0].y,
            points[1].x, points[1].y,
            points[2].x, points[2].y,
            points[3].x, points[3].y
        ]);
        
        let dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            width, 0,
            width, height,
            0, height
        ]);
        
        let M = cv.getPerspectiveTransform(srcPoints, dstPoints);
        let warped = new cv.Mat();
        cv.warpPerspective(src, warped, M, new cv.Size(width, height));
        
        srcPoints.delete();
        dstPoints.delete();
        M.delete();
        
        return warped;
    }

    start() {
        console.log('启动ImageProcessor');
        this.isRunning = true;
        this.reset();
    }

    stop() {
        console.log('停止ImageProcessor');
        this.isRunning = false;
        this.reset();
    }
}

class KalmanFilter {
    constructor() {
        this.x = 0;
        this.P = 1;
        this.Q = 0.1;
        this.R = 0.1;
        this.K = 0;
    }

    predict() {
        this.P = this.P + this.Q;
    }

    update(measurement) {
        this.K = this.P / (this.P + this.R);
        this.x = this.x + this.K * (measurement - this.x);
        this.P = (1 - this.K) * this.P;
        return this.x;
    }
}
/* global importScripts, Vision */
// MediaPipe runs in this worker; classroom frames never leave the browser.
let detector;

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      importScripts("/vision/vision_bundle.js");
      const files = await Vision.FilesetResolver.forVisionTasks("/vision/wasm");
      detector = await Vision.ObjectDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/vision/efficientdet_lite0.tflite", delegate: "CPU" },
        runningMode: "IMAGE", categoryAllowlist: ["person"], scoreThreshold: 0.55,
      });
      self.postMessage({ id: data.id, ready: true });
    } else if (data.type === "frame" && detector) {
      try {
        const result = detector.detect(data.frame);
        const people = result.detections.filter((detection) =>
          detection.categories.some((category) => category.categoryName === "person" && category.score >= 0.55)
        );
        self.postMessage({ id: data.id, count: people.length });
      } finally {
        data.frame.close();
      }
    }
  } catch {
    self.postMessage({ id: data.id, error: "تعذر تحليل الفيديو. أعد المحاولة." });
  }
};

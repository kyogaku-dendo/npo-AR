import React, { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  FaceLandmarker,
  HandLandmarker,
} from "@mediapipe/tasks-vision";

const CameraView: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [cameraMode, setCameraMode] = useState<"user" | "environment">(
    isMobile ? "environment" : "user"
  );

  const [facePos, setFacePos] = useState<{ x: number; y: number } | null>(null);
  const [faceScale, setFaceScale] = useState<number>(100);
  const [handVisible, setHandVisible] = useState(false);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [isSaved, setIsSaved] = useState(false);


  const setupCamera = async (mode: "user" | "environment") => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        facingMode: mode,
      },
    });

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  };

  useEffect(() => {
    let running = true;

    const setupMediapipe = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        },
        runningMode: "VIDEO",
      });

      handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        },
        runningMode: "VIDEO",
      });
    };

    const resizeCanvasToWindow = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const renderLoop = async () => {
      if (
        !running ||
        !videoRef.current ||
        !faceLandmarkerRef.current ||
        !handLandmarkerRef.current ||
        !canvasRef.current
      )
        return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cw = canvas.width;
      const ch = canvas.height;

      const videoAspect = vw / vh;
      const canvasAspect = cw / ch;

      let srcX = 0,
        srcY = 0,
        srcW = vw,
        srcH = vh;
      if (videoAspect > canvasAspect) {
        srcW = vh * canvasAspect;
        srcX = (vw - srcW) / 2;
      } else {
        srcH = vw / canvasAspect;
        srcY = (vh - srcH) / 2;
      }

      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, cw, ch);

      const nowInMs = Date.now();
      const faceResult = await faceLandmarkerRef.current.detectForVideo(video, nowInMs);
      const handResult = await handLandmarkerRef.current.detectForVideo(video, nowInMs);

      if (faceResult.faceLandmarks?.length) {
        const landmarks = faceResult.faceLandmarks[0];
        const nose = landmarks[1];
        const chin = landmarks[152];
        const forehead = landmarks[10];
        const faceHeight = Math.abs(chin.y - forehead.y);

        const adjX = (nose.x * vw - srcX) / srcW;
        const adjY = (nose.y * vh - srcY) / srcH;
        const x = adjX * cw;
        const y = adjY * ch;
        setFacePos({ x, y });
        setFaceScale(faceHeight * ch * 1.2);
      }

      setHandVisible(handResult.landmarks && handResult.landmarks.length > 0);
      requestAnimationFrame(renderLoop);
    };

    const init = async () => {
      await setupCamera(cameraMode);
      await setupMediapipe();
      resizeCanvasToWindow();
      window.addEventListener("resize", resizeCanvasToWindow);
      renderLoop();
    };

    init();

    return () => {
      running = false;
      window.removeEventListener("resize", resizeCanvasToWindow);
    };
  }, [cameraMode]);

  const takePhoto = async () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (handVisible && facePos) {
      const img = new Image();
      img.src = "/npo.png";
      await new Promise((resolve) => (img.onload = resolve));
      const w = faceScale;
      const h = faceScale;
      ctx.drawImage(img, facePos.x - w / 2, facePos.y - h * 1.5, w, h);
    }

    const dataUrl = canvas.toDataURL("image/png");
    setPhotoData(dataUrl);
    setIsPreview(true);
    setIsSaved(false);
  };

  const toggleCamera = async () => {
    setCameraMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const closePreview = () => setIsPreview(false);
  const handleSave = () => setIsSaved(true);

  const handleShareToX = () => {
    if (!photoData) return;
    const text = encodeURIComponent("#んぽたそといっしょ");
    const url = encodeURIComponent(window.location.href);
    const shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    window.open(shareUrl, "_blank");
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh", // 💡 Safari/Chrome対応
        minHeight: "100svh",
        overflow: "hidden",
        backgroundColor: "black",
      }}
    >
      <video ref={videoRef} style={{ display: "none" }} />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* 顔の上に npo.png */}
      {handVisible && facePos && (
        <img
          src="/npo.png"
          alt="popup"
          style={{
            position: "absolute",
            left: `${facePos.x - faceScale / 2}px`,
            top: `${facePos.y - faceScale * 1.5}px`,
            width: `${faceScale}px`,
            height: `${faceScale}px`,
            transition: "opacity 0.3s",
          }}
        />
      )}

      {/* 📸 ボタン */}
      {!isPreview && (
        <>
          <button
            onClick={takePhoto}
            style={{
              position: "absolute",
              bottom: "40px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              border: "4px solid white",
              backgroundColor: "rgba(255,255,255,0.2)",
              cursor: "pointer",
            }}
          />
          <button
            onClick={toggleCamera}
            style={{
              position: "absolute",
              bottom: "60px",
              right: "30px",
              background: "rgba(255,255,255,0.3)",
              border: "2px solid white",
              borderRadius: "50%",
              width: "60px",
              height: "60px",
              fontSize: "10px",
              color: "white",
              cursor: "pointer",
            }}
          >
            カメラ切替
          </button>
        </>
      )}

      {/* 🖼️ プレビュー */}
      {isPreview && photoData && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            zIndex: 20,
          }}
        >
          <img
            src={photoData}
            alt="preview"
            style={{
              maxWidth: "90%",
              maxHeight: "80%",
              borderRadius: "12px",
              boxShadow: "0 0 20px rgba(255,255,255,0.3)",
            }}
          />
          <div style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
            <button
              onClick={closePreview}
              style={{
                background: "white",
                border: "none",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: "bold",
                color: "black",
              }}
            >
              戻る
            </button>
            <a
              href={photoData}
              download="photo.png"
              onClick={handleSave}
              style={{
                background: "#4caf50",
                color: "white",
                padding: "10px 20px",
                borderRadius: "8px",
                textDecoration: "none",
                fontWeight: "bold",
              }}
            >
              画像を保存
            </a>
            <button
              onClick={handleShareToX}
              disabled={!isSaved}
              style={{
                background: isSaved ? "#1DA1F2" : "gray",
                color: "white",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: "bold",
                opacity: isSaved ? 1 : 0.6,
                cursor: isSaved ? "pointer" : "not-allowed",
              }}
            >
              Xで共有
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraView;

import React, { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  FaceLandmarker,
} from "@mediapipe/tasks-vision";
import "./CameraView.css";

type Overlay = {
  id: number;
  src: string;
  name: string;
  x: number;
  y: number;
  scale: number;
  visible: boolean;
};

const CameraView: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number>();

  const [overlay, setOverlay] = useState<Overlay>({
    id: 1,
    name: "んぽたそ",
    src: "/npo.png",
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    scale: 1.0,
    visible: false,
  });

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // === カメラ起動 ===
  useEffect(() => {
    const startCamera = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: window.innerWidth },
          height: { ideal: window.innerHeight },
        },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    };
    startCamera();

    return () => {
      const tracks = (videoRef.current?.srcObject as MediaStream)?.getTracks();
      tracks?.forEach((t) => t.stop());
    };
  }, []);

  // === MediaPipe 初期化 ===
  useEffect(() => {
    const initModels = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const [handLandmarker, faceLandmarker] = await Promise.all([
        HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          },
          runningMode: "VIDEO",
          numHands: 1,
        }),
        FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        }),
      ]);

      handLandmarkerRef.current = handLandmarker;
      faceLandmarkerRef.current = faceLandmarker;

      if (videoRef.current) videoRef.current.onloadeddata = () => detectLoop();
    };

    initModels();

    const detectLoop = async () => {
      const video = videoRef.current;
      if (!video || !handLandmarkerRef.current || !faceLandmarkerRef.current) {
        requestAnimationFrame(detectLoop);
        return;
      }
      if (video.videoWidth === 0) {
        requestAnimationFrame(detectLoop);
        return;
      }

      const now = Date.now();
      const handResult = await handLandmarkerRef.current.detectForVideo(video, now);
      const faceResult = await faceLandmarkerRef.current.detectForVideo(video, now);

      let isPalm = false;
      let newX = overlay.x;
      let newY = overlay.y;
      let newScale = overlay.scale;

      // === 手のひら判定 ===
      if (handResult.landmarks?.[0]) {
        isPalm = detectPalmFacingCamera(handResult.landmarks[0]);
      }

      // === 顔位置に基づいてんぽたそ配置 ===
      if (faceResult.faceLandmarks?.[0]) {
        const face = faceResult.faceLandmarks[0];
        const nose = face[1];
        const left = face[234];
        const right = face[454];
      
        if (nose && left && right && videoRef.current) {
          const video = videoRef.current;
          const videoW = video.videoWidth;
          const videoH = video.videoHeight;
      
          // ==== ビデオの実サイズ → 画面上の表示範囲 ====
          const rect = video.getBoundingClientRect();
      
          // object-fit: cover のズレ補正
          const videoAspect = videoW / videoH;
          const viewAspect = rect.width / rect.height;
          let drawX = rect.x;
          let drawY = rect.y;
          let scaleX = rect.width / videoW;
          let scaleY = rect.height / videoH;
      
          if (videoAspect > viewAspect) {
            // 横が広い（左右トリミング）
            const scaledVideoW = videoH * viewAspect;
            const offsetX = (videoW - scaledVideoW) / 2;
            scaleX = rect.width / scaledVideoW;
            drawX = rect.x - offsetX * scaleX;
          } else if (videoAspect < viewAspect) {
            // 縦が広い（上下トリミング）
            const scaledVideoH = videoW / viewAspect;
            const offsetY = (videoH - scaledVideoH) / 2;
            scaleY = rect.height / scaledVideoH;
            drawY = rect.y - offsetY * scaleY;
          }
      
          // ==== 顔座標を画面座標へ変換 ====
          const toScreen = (p: any) => ({
            x: drawX + p.x * videoW * scaleX,
            y: drawY + p.y * videoH * scaleY,
          });
      
          const nosePos = toScreen(nose);
          const leftPos = toScreen(left);
          const rightPos = toScreen(right);
      
          const faceWidthPx = Math.abs(rightPos.x - leftPos.x);
          const placeRight = nosePos.x < window.innerWidth / 2;
          const offsetX = placeRight ? faceWidthPx * 1.3: -faceWidthPx * 1.3;
      
          newX = nosePos.x + offsetX;
          newY = nosePos.y - faceWidthPx; // 少し上に
          newScale = Math.min(Math.max(faceWidthPx / 150, 0.8), 2.0);
      
          // 画面外補正
          newX = Math.min(
            Math.max(newX, (150 * newScale) / 2),
            window.innerWidth - (150 * newScale) / 2
          );
          newY = Math.min(
            Math.max(newY, (150 * newScale) / 2),
            window.innerHeight - (150 * newScale) / 2
          );
        }
      }
      

      // スムーズに移動
      setOverlay((prev) => ({
        ...prev,
        visible: isPalm,
        x: lerp(prev.x, newX, 0.25),
        y: lerp(prev.y, newY, 0.25),
        scale: lerp(prev.scale, newScale, 0.2),
      }));

      animationFrameRef.current = requestAnimationFrame(detectLoop);
    };

    return () => cancelAnimationFrame(animationFrameRef.current!);
  }, []);

  // === 手のひら判定 ===
  const detectPalmFacingCamera = (hand: any[]): boolean => {
    const zValues = hand.map((p) => p.z);
    const zRange = Math.max(...zValues) - Math.min(...zValues);
    const avgZ = zValues.reduce((a, b) => a + b, 0) / zValues.length;
    return avgZ < 0 && zRange < 0.15;
  };

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  // === 撮影処理 ===
  const handleCapture = () => {
    if (!videoRef.current || !captureCanvasRef.current) return;

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // カメラ映像を描画
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // んぽたそを描画
    if (overlay.visible) {
      const img = new Image();
      img.src = overlay.src;
      img.onload = () => {
        const scale = 150 * overlay.scale;
        const drawX = (overlay.x / window.innerWidth) * canvas.width;
        const drawY = (overlay.y / window.innerHeight) * canvas.height;
        ctx.drawImage(img, drawX - scale / 2, drawY - scale / 2, scale, scale);
        setPreviewImage(canvas.toDataURL("image/png"));
      };
    } else {
      setPreviewImage(canvas.toDataURL("image/png"));
    }
  };

  // === 保存 ===
  const handleSave = () => {
    if (!previewImage) return;
    const a = document.createElement("a");
    a.href = previewImage;
    a.download = `npocamera_${Date.now()}.png`;
    a.click();
  };

  // === 共有 ===
  const handleShare = async () => {
    if (!previewImage) return;
    try {
      const res = await fetch(previewImage);
      const blob = await res.blob();
      const file = new File([blob], "npo.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "んぽたそカメラ📸",
          text: "んぽたそカメラで撮ったよ！",
          files: [file],
        });
      } else {
        const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
          "#んぽたそカメラで撮ったよ"
        )}`;
        window.open(tweetUrl, "_blank");
      }
    } catch (err) {
      console.error("共有に失敗:", err);
    }
  };

  return (
    <div className="camera-container">
      <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
      <canvas ref={captureCanvasRef} style={{ display: "none" }} />

      {/* === んぽたそ === */}
      {overlay.visible && (
        <img
          src={overlay.src}
          alt={overlay.name}
          className="overlay-image"
          style={{
            top: `${overlay.y}px`,
            left: `${overlay.x}px`,
            width: `${150 * overlay.scale}px`,
            transform: "translate(-50%, -50%)",
          }}
        />
      )}

      {/* === 撮影ボタン === */}
      {!previewImage && (
        <div className="camera-ui">
          <button className="capture-btn" onClick={handleCapture}></button>
        </div>
      )}

      {/* === プレビュー（チェキ風） === */}
      {previewImage && (
        <div className="preview-overlay">
          <div className="preview-frame">
            <img src={previewImage} alt="preview" />
            <div className="preview-buttons">
              <button className="save-btn" onClick={handleSave}>保存</button>
              <button className="x-btn" onClick={handleShare}>𝕏にポスト</button>
              <button className="close-btn" onClick={() => setPreviewImage(null)}>戻る</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraView;

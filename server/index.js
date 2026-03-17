/* eslint-disable no-undef */
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const admin = require("firebase-admin");
const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((v) => v.trim())
      : ["http://localhost:5173"],
  })
);
app.use(express.json());

const uploadsRoot = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ message: "토큰이 없습니다." });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ message: "유효하지 않은 토큰입니다." });
  }
}

async function syncUser(req, res, next) {
  try {
    const { uid, email } = req.user;

    const existing = await prisma.user.findUnique({
      where: { uid },
    });

    if (!existing) {
      const isAdmin = email === "admin@bumcloud.com";

      await prisma.user.create({
        data: {
          uid,
          email,
          role: isAdmin ? "admin" : "user",
          approved: isAdmin,
        },
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({ message: "유저 동기화 실패" });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const me = await prisma.user.findUnique({
      where: { uid: req.user.uid },
    });

    if (!me || me.role !== "admin") {
      return res.status(403).json({ message: "관리자만 접근 가능합니다." });
    }

    req.dbUser = me;
    next();
  } catch (error) {
    return res.status(500).json({ message: "권한 확인 실패" });
  }
}

async function requireApproved(req, res, next) {
  try {
    const me = await prisma.user.findUnique({
      where: { uid: req.user.uid },
    });

    if (!me) {
      return res.status(404).json({ message: "유저를 찾을 수 없습니다." });
    }

    if (me.role !== "admin" && !me.approved) {
      return res.status(403).json({ message: "승인된 사용자만 접근할 수 있습니다." });
    }

    req.dbUser = me;
    next();
  } catch (error) {
    return res.status(500).json({ message: "권한 확인 실패" });
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userFolder = path.join(uploadsRoot, req.user.uid);
    if (!fs.existsSync(userFolder)) {
      fs.mkdirSync(userFolder, { recursive: true });
    }
    cb(null, userFolder);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024 * 10,
  },
});

app.get("/api/health", async (req, res) => {
  const count = await prisma.user.count();
  res.json({ ok: true, users: count });
});

app.get("/api/me", verifyFirebaseToken, syncUser, async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { uid: req.user.uid },
  });

  res.json(me);
});

app.get(
  "/api/admin/users",
  verifyFirebaseToken,
  syncUser,
  requireAdmin,
  async (req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  }
);

app.patch(
  "/api/admin/users/:uid/approve",
  verifyFirebaseToken,
  syncUser,
  requireAdmin,
  async (req, res) => {
    const target = await prisma.user.findUnique({
      where: { uid: req.params.uid },
    });

    if (!target) {
      return res.status(404).json({ message: "유저를 찾을 수 없습니다." });
    }

    const updated = await prisma.user.update({
      where: { uid: req.params.uid },
      data: {
        approved: true,
        role: target.role === "user" ? "verified" : target.role,
      },
    });

    res.json(updated);
  }
);

app.patch(
  "/api/admin/users/:uid/revoke",
  verifyFirebaseToken,
  syncUser,
  requireAdmin,
  async (req, res) => {
    const target = await prisma.user.findUnique({
      where: { uid: req.params.uid },
    });

    if (!target) {
      return res.status(404).json({ message: "유저를 찾을 수 없습니다." });
    }

    const updated = await prisma.user.update({
      where: { uid: req.params.uid },
      data: {
        approved: false,
        role: target.role === "admin" ? "admin" : "user",
      },
    });

    res.json(updated);
  }
);

app.post(
  "/api/files/upload",
  verifyFirebaseToken,
  syncUser,
  requireApproved,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "파일이 없습니다." });
      }

      const created = await prisma.file.create({
        data: {
          uploaderUid: req.user.uid,
          originalName: req.file.originalname,
          savedName: req.file.filename,
          filePath: req.file.path,
          fileSize: BigInt(req.file.size),
          comment: req.body.comment || "",
        },
      });

      res.json({
        message: "업로드 성공",
        file: {
          ...created,
          fileSize: Number(created.fileSize),
        },
      });
    } catch (error) {
      res.status(500).json({ message: "업로드 실패" });
    }
  }
);

app.get(
  "/api/files",
  verifyFirebaseToken,
  syncUser,
  requireApproved,
  async (req, res) => {
    try {
      const files = await prisma.file.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          uploader: {
            select: {
              uid: true,
              email: true,
            },
          },
        },
      });

      res.json(
        files.map((file) => ({
          ...file,
          fileSize: Number(file.fileSize),
        }))
      );
    } catch (error) {
      res.status(500).json({ message: "파일 목록 조회 실패" });
    }
  }
);

app.get(
  "/api/files/:id/download",
  verifyFirebaseToken,
  syncUser,
  requireApproved,
  async (req, res) => {
    try {
      const file = await prisma.file.findUnique({
        where: { id: req.params.id },
      });

      if (!file) {
        return res.status(404).json({ message: "파일을 찾을 수 없습니다." });
      }

      if (!fs.existsSync(file.filePath)) {
        return res.status(404).json({ message: "실제 파일이 없습니다." });
      }

      return res.download(file.filePath, file.originalName);
    } catch (error) {
      res.status(500).json({ message: "다운로드 실패" });
    }
  }
);

app.delete(
  "/api/files/:id",
  verifyFirebaseToken,
  syncUser,
  requireApproved,
  async (req, res) => {
    try {
      const file = await prisma.file.findUnique({
        where: { id: req.params.id },
      });

      if (!file) {
        return res.status(404).json({ message: "파일을 찾을 수 없습니다." });
      }

      const isAdmin = req.dbUser.role === "admin";
      const isOwner = file.uploaderUid === req.user.uid;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({ message: "본인 파일 또는 관리자만 삭제할 수 있습니다." });
      }

      if (fs.existsSync(file.filePath)) {
        fs.unlinkSync(file.filePath);
      }

      await prisma.file.delete({
        where: { id: file.id },
      });

      res.json({ message: "삭제 완료" });
    } catch (error) {
      res.status(500).json({ message: "삭제 실패" });
    }
  }
);

app.patch(
  "/api/files/:id/comment",
  verifyFirebaseToken,
  syncUser,
  requireApproved,
  async (req, res) => {
    try {
      const file = await prisma.file.findUnique({
        where: { id: req.params.id },
      });

      if (!file) {
        return res.status(404).json({ message: "파일을 찾을 수 없습니다." });
      }

      const updated = await prisma.file.update({
        where: { id: req.params.id },
        data: {
          comment: req.body.comment ?? "",
        },
      });

      res.json({
        ...updated,
        fileSize: Number(updated.fileSize),
      });
    } catch (error) {
      res.status(500).json({ message: "코멘트 저장 실패" });
    }
  }
);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
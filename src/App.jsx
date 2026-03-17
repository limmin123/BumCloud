import { useEffect, useMemo, useState } from "react";
import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

const API_BASE = import.meta.env.VITE_API_BASE;

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadComment, setUploadComment] = useState("");
  const [uploading, setUploading] = useState(false);

  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [editingFileId, setEditingFileId] = useState(null);
  const [commentDraft, setCommentDraft] = useState("");

  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageTitle, setMessageTitle] = useState("");
  const [messageText, setMessageText] = useState("");

  const openMessageModal = (title, text) => {
    setMessageTitle(title);
    setMessageText(text);
    setShowMessageModal(true);
  };

  const clearInputs = () => {
    setEmail("");
    setPassword("");
  };

  const moveMode = (nextMode) => {
    clearInputs();
    setMode(nextMode);
  };

  const getAuthToken = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("로그인된 유저가 없습니다.");
    return await currentUser.getIdToken();
  };

  const getJsonHeaders = async () => {
    const token = await getAuthToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  const fetchMyProfile = async (firebaseUser) => {
    try {
      setLoadingProfile(true);

      const idToken = await firebaseUser.getIdToken();

      const res = await fetch(`${API_BASE}/api/me`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "내 정보 조회 실패");
      }

      setProfile(data);
    } catch (err) {
      openMessageModal("프로필 조회 실패", err.message);
      setProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);

      const headers = await getJsonHeaders();

      const res = await fetch(`${API_BASE}/api/admin/users`, {
        headers,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "유저 목록 조회 실패");
      }

      setUsers(data);
    } catch (err) {
      openMessageModal("유저 목록 오류", err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchFiles = async () => {
    try {
      setLoadingFiles(true);

      const token = await getAuthToken();

      const res = await fetch(`${API_BASE}/api/files`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "파일 목록 조회 실패");
      }

      setFiles(data);
    } catch (err) {
      openMessageModal("파일 목록 오류", err.message);
    } finally {
      setLoadingFiles(false);
    }
  };

  const patchUserAction = async (uid, action) => {
    try {
      const headers = await getJsonHeaders();

      const res = await fetch(`${API_BASE}/api/admin/users/${uid}/${action}`, {
        method: "PATCH",
        headers,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "처리 실패");
      }

      await fetchUsers();
      await fetchMyProfile(auth.currentUser);
    } catch (err) {
      openMessageModal("관리 작업 실패", err.message);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      openMessageModal("파일 선택", "업로드할 파일을 먼저 선택하세요.");
      return;
    }

    try {
      setUploading(true);

      const token = await getAuthToken();
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("comment", uploadComment);

      const res = await fetch(`${API_BASE}/api/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "업로드 실패");
      }

      setSelectedFile(null);
      setUploadComment("");
      await fetchFiles();
      openMessageModal("업로드 성공", `${data.file.originalName} 업로드 완료`);
    } catch (err) {
      openMessageModal("업로드 실패", err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (fileId, fileName) => {
    try {
      const token = await getAuthToken();

      const res = await fetch(`${API_BASE}/api/files/${fileId}/download`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "다운로드 실패");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      openMessageModal("다운로드 실패", err.message);
    }
  };

  const handleDelete = async (fileId) => {
    const ok = window.confirm("이 파일을 삭제할까요?");
    if (!ok) return;

    try {
      const token = await getAuthToken();

      const res = await fetch(`${API_BASE}/api/files/${fileId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "삭제 실패");
      }

      await fetchFiles();
      openMessageModal("삭제 완료", "파일이 삭제되었습니다.");
    } catch (err) {
      openMessageModal("삭제 실패", err.message);
    }
  };

  const startEditComment = (file) => {
    setEditingFileId(file.id);
    setCommentDraft(file.comment || "");
  };

  const cancelEditComment = () => {
    setEditingFileId(null);
    setCommentDraft("");
  };

  const saveComment = async (fileId) => {
    try {
      const headers = await getJsonHeaders();

      const res = await fetch(`${API_BASE}/api/files/${fileId}/comment`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          comment: commentDraft,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "코멘트 저장 실패");
      }

      setFiles((prev) =>
        prev.map((file) =>
          file.id === fileId ? { ...file, comment: data.comment } : file
        )
      );

      setEditingFileId(null);
      setCommentDraft("");
      openMessageModal("저장 완료", "코멘트가 저장되었습니다.");
    } catch (err) {
      openMessageModal("저장 실패", err.message);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      openMessageModal("입력 확인", "이메일과 비밀번호를 입력하세요.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      openMessageModal("로그인 실패", "이메일 또는 비밀번호를 확인하세요.");
    }
  };

  const handleSignup = async () => {
    if (!email || !password) {
      openMessageModal("입력 확인", "이메일과 비밀번호를 입력하세요.");
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      openMessageModal(
        "회원가입 성공",
        "계정이 생성되었습니다. 관리자 승인 후 주요 기능을 사용할 수 있습니다."
      );
      moveMode("login");
    } catch (err) {
      openMessageModal("회원가입 실패", err.message);
    }
  };

  const handleReset = async () => {
    if (!email) {
      openMessageModal("이메일 필요", "비밀번호를 재설정할 이메일을 입력하세요.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      openMessageModal(
        "메일 전송 완료",
        `${email} 주소로 비밀번호 재설정 메일을 보냈습니다. 스팸함도 확인해보세요.`
      );
      moveMode("login");
    } catch (err) {
      openMessageModal("메일 전송 실패", err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setProfile(null);
      setUsers([]);
      setFiles([]);
      setSelectedFile(null);
      setUploadComment("");
    } catch (err) {
      openMessageModal("로그아웃 실패", err.message);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        await fetchMyProfile(currentUser);
      } else {
        setProfile(null);
        setLoadingProfile(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (profile?.role === "admin") {
      fetchUsers();
    }

    if (profile?.approved || profile?.role === "admin") {
      fetchFiles();
    }
  }, [profile?.role, profile?.approved]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) =>
      u.email.toLowerCase().includes(search.toLowerCase())
    );
  }, [users, search]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 px-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              BumCloud
            </h1>
          </div>

          {mode === "login" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900">로그인</h2>
                <p className="mt-2 text-sm text-slate-500">
                  계정에 로그인해서 대시보드로 이동하세요.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    이메일
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    비밀번호
                  </label>
                  <input
                    type="password"
                    placeholder="비밀번호 입력"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <button
                  onClick={handleLogin}
                  className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700"
                >
                  로그인
                </button>

                <div className="flex items-center justify-between pt-2 text-sm">
                  <button
                    onClick={() => moveMode("reset")}
                    className="text-slate-500 hover:text-slate-800"
                  >
                    비밀번호를 잊으셨나요?
                  </button>

                  <button
                    onClick={() => moveMode("signup")}
                    className="font-medium text-blue-600 hover:text-blue-800"
                  >
                    회원가입
                  </button>
                </div>
              </div>
            </>
          )}

          {mode === "signup" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900">회원가입</h2>
                <p className="mt-2 text-sm text-slate-500">
                  새 계정을 만들고 BumCloud를 시작하세요.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    이메일
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-green-500"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    비밀번호
                  </label>
                  <input
                    type="password"
                    placeholder="비밀번호 입력"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-green-500"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <button
                  onClick={handleSignup}
                  className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white transition hover:bg-green-700"
                >
                  회원가입 완료
                </button>

                <div className="pt-2 text-center text-sm">
                  <span className="text-slate-500">이미 계정이 있나요? </span>
                  <button
                    onClick={() => moveMode("login")}
                    className="font-medium text-blue-600 hover:text-blue-800"
                  >
                    로그인으로 이동
                  </button>
                </div>
              </div>
            </>
          )}

          {mode === "reset" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900">
                  비밀번호 재설정
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  가입한 이메일 주소로 재설정 메일을 보냅니다.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    이메일
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-700"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <button
                  onClick={handleReset}
                  className="w-full rounded-xl bg-slate-800 py-3 font-semibold text-white transition hover:bg-slate-900"
                >
                  재설정 메일 보내기
                </button>

                <div className="pt-2 text-center text-sm">
                  <button
                    onClick={() => moveMode("login")}
                    className="font-medium text-blue-600 hover:text-blue-800"
                  >
                    로그인으로 돌아가기
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <MessageModal
          open={showMessageModal}
          title={messageTitle}
          text={messageText}
          onClose={() => setShowMessageModal(false)}
        />
      </div>
    );
  }

  if (loadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl bg-white px-6 py-4 shadow">
          사용자 정보를 불러오는 중...
        </div>
      </div>
    );
  }

  if (profile?.role === "admin") {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-6 shadow md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-slate-500">Admin Panel</p>
              <h1 className="text-3xl font-bold text-slate-900">
                관리자 전용 페이지
              </h1>
            </div>

            <div className="flex gap-3">
              <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                {profile.email}
              </div>
              <button
                onClick={handleLogout}
                className="rounded-xl bg-red-500 px-5 py-3 font-medium text-white hover:bg-red-600"
              >
                로그아웃
              </button>
            </div>
          </div>

          <div className="mb-6 grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl bg-white p-6 shadow">
              <p className="text-sm text-slate-500">전체 유저</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {users.length}
              </p>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow">
              <p className="text-sm text-slate-500">승인 대기</p>
              <p className="mt-2 text-3xl font-bold text-amber-500">
                {users.filter((u) => !u.approved && u.role !== "admin").length}
              </p>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow">
              <p className="text-sm text-slate-500">인증 완료</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600">
                {users.filter((u) => u.approved).length}
              </p>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">유저 관리</h2>
                <p className="mt-1 text-sm text-slate-500">
                  관리자만 접근 가능한 승인/권한 관리 화면입니다.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="이메일 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none md:w-72"
                />
                <button
                  onClick={fetchUsers}
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
                >
                  새로고침
                </button>
              </div>
            </div>

            {loadingUsers ? (
              <div className="rounded-2xl border border-slate-200 p-6 text-slate-500">
                불러오는 중...
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">이메일</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">권한</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">승인</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">가입일</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.uid} className="border-t border-slate-200">
                        <td className="px-4 py-3 text-slate-800">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.approved ? (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                              승인됨
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                              대기중
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {new Date(u.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {u.role !== "admin" && !u.approved && (
                              <button
                                onClick={() => patchUserAction(u.uid, "approve")}
                                className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-600"
                              >
                                승인
                              </button>
                            )}

                            {u.role !== "admin" && u.approved && (
                              <button
                                onClick={() => patchUserAction(u.uid, "revoke")}
                                className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white hover:bg-amber-600"
                              >
                                승인취소
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td
                          colSpan="5"
                          className="px-4 py-10 text-center text-slate-500"
                        >
                          검색 결과가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6">
            <FileTable
              files={files}
              loadingFiles={loadingFiles}
              onRefresh={fetchFiles}
              onDownload={handleDownload}
              onDelete={handleDelete}
              editingFileId={editingFileId}
              commentDraft={commentDraft}
              setCommentDraft={setCommentDraft}
              onStartEdit={startEditComment}
              onCancelEdit={cancelEditComment}
              onSaveComment={saveComment}
              currentUid={profile.uid}
              isAdmin={true}
            />
          </div>
        </div>

        <MessageModal
          open={showMessageModal}
          title={messageTitle}
          text={messageText}
          onClose={() => setShowMessageModal(false)}
        />
      </div>
    );
  }

  if (!profile?.approved) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl bg-white p-8 shadow">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pending Approval</p>
                <h1 className="text-3xl font-bold text-slate-900">
                  승인 대기중
                </h1>
              </div>

              <button
                onClick={handleLogout}
                className="rounded-xl bg-red-500 px-5 py-3 font-medium text-white hover:bg-red-600"
              >
                로그아웃
              </button>
            </div>

            <div className="rounded-2xl bg-amber-50 p-6">
              <p className="text-lg font-semibold text-amber-800">
                아직 관리자 승인이 완료되지 않았습니다.
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-700">
                현재 계정은 로그인만 가능한 상태입니다.
                <br />
                관리자 승인 후 업로드, 다운로드 등 주요 기능을 사용할 수 있습니다.
              </p>
            </div>

            <div className="mt-6 rounded-2xl bg-slate-50 p-6">
              <p className="text-sm text-slate-500">내 계정</p>
              <p className="mt-2 break-all text-lg font-semibold text-slate-900">
                {profile.email}
              </p>
              <div className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                상태: 승인 대기
              </div>
            </div>
          </div>
        </div>

        <MessageModal
          open={showMessageModal}
          title={messageTitle}
          text={messageText}
          onClose={() => setShowMessageModal(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-6 shadow md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-500">Welcome back</p>
            <h1 className="text-3xl font-bold text-slate-900">
              BumCloud Dashboard
            </h1>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-xl bg-red-500 px-5 py-3 font-medium text-white hover:bg-red-600"
          >
            로그아웃
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-6 shadow md:col-span-2">
            <h2 className="text-xl font-bold text-slate-900">파일 업로드</h2>
            <p className="mt-2 text-slate-500">
              승인된 계정은 파일 업로드, 목록 조회, 다운로드, 코멘트 작성이 가능합니다.
            </p>

            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6">
              <input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="mb-4 block w-full text-sm text-slate-700"
              />

              <textarea
                placeholder="파일에 대한 간단한 코멘트"
                value={uploadComment}
                onChange={(e) => setUploadComment(e.target.value)}
                className="mb-4 min-h-[100px] w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
              />

              {selectedFile && (
                <div className="mb-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                  선택 파일: <span className="font-semibold">{selectedFile.name}</span>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={uploading}
                className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {uploading ? "업로드 중..." : "업로드"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm text-slate-500">현재 로그인 계정</p>
            <p className="mt-2 break-all text-lg font-semibold text-blue-600">
              {profile.email}
            </p>

            <div className="mt-6 space-y-3">
              <div className="rounded-2xl bg-slate-100 p-4">
                <p className="text-sm text-slate-500">권한</p>
                <p className="font-semibold text-slate-900">{profile.role}</p>
              </div>

              <div className="rounded-2xl bg-slate-100 p-4">
                <p className="text-sm text-slate-500">인증 상태</p>
                <p className="font-semibold text-emerald-600">승인 완료</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <FileTable
            files={files}
            loadingFiles={loadingFiles}
            onRefresh={fetchFiles}
            onDownload={handleDownload}
            onDelete={handleDelete}
            editingFileId={editingFileId}
            commentDraft={commentDraft}
            setCommentDraft={setCommentDraft}
            onStartEdit={startEditComment}
            onCancelEdit={cancelEditComment}
            onSaveComment={saveComment}
            currentUid={profile.uid}
            isAdmin={profile.role === "admin"}
          />
        </div>
      </div>

      <MessageModal
        open={showMessageModal}
        title={messageTitle}
        text={messageText}
        onClose={() => setShowMessageModal(false)}
      />
    </div>
  );
}

function FileTable({
  files,
  loadingFiles,
  onRefresh,
  onDownload,
  onDelete,
  editingFileId,
  commentDraft,
  setCommentDraft,
  onStartEdit,
  onCancelEdit,
  onSaveComment,
  currentUid,
  isAdmin,
}) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">파일 목록</h2>
          <p className="mt-1 text-sm text-slate-500">
            인증된 유저가 업로드한 파일을 볼 수 있습니다.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
        >
          새로고침
        </button>
      </div>

      {loadingFiles ? (
        <div className="rounded-2xl border border-slate-200 p-6 text-slate-500">
          불러오는 중...
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 p-6 text-slate-500">
          업로드된 파일이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">파일명</th>
                <th className="px-4 py-3 font-semibold text-slate-700">크기</th>
                <th className="px-4 py-3 font-semibold text-slate-700">업로더</th>
                <th className="px-4 py-3 font-semibold text-slate-700">코멘트</th>
                <th className="px-4 py-3 font-semibold text-slate-700">업로드일</th>
                <th className="px-4 py-3 font-semibold text-slate-700">작업</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const canDelete = isAdmin || currentUid === file.uploaderUid;
                const isEditing = editingFileId === file.id;

                return (
                  <tr key={file.id} className="border-t border-slate-200 align-top">
                    <td className="px-4 py-3 text-slate-800">{file.originalName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {Number(file.fileSize).toLocaleString()} bytes
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {file.uploader?.email || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={commentDraft}
                            onChange={(e) => setCommentDraft(e.target.value)}
                            className="min-h-[90px] w-64 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => onSaveComment(file.id)}
                              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              저장
                            </button>
                            <button
                              onClick={onCancelEdit}
                              className="rounded-lg bg-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-400"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-xs whitespace-pre-wrap break-words">
                          {file.comment || "-"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(file.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => onDownload(file.id, file.originalName)}
                          className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-600"
                        >
                          다운로드
                        </button>

                        {!isEditing && (
                          <button
                            onClick={() => onStartEdit(file)}
                            className="rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white hover:bg-blue-600"
                          >
                            코멘트
                          </button>
                        )}

                        {canDelete && (
                          <button
                            onClick={() => onDelete(file.id)}
                            className="rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white hover:bg-red-600"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MessageModal({ open, title, text, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-3 text-xl font-bold text-slate-900">{title}</h2>
        <p className="mb-6 break-words text-sm leading-relaxed text-slate-600">
          {text}
        </p>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
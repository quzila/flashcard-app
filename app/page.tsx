'use client';

import { useState, useEffect } from 'react';

// 型定義
type Card = {
  id: number;
  question: string;
  answer: string;
};

export default function Home() {
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [playCards, setPlayCards] = useState<Card[]>([]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wrongIds, setWrongIds] = useState<Set<number>>(new Set());
  const [isFinished, setIsFinished] = useState(false);

  // CSVを正しくパースする関数（クォーテーション内の改行に対応）
  const parseCSV = (text: string): Card[] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let insideQuotes = false;

    // 文字を1つずつ確認して処理
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // エスケープされたクォーテーション（""）の場合
          currentCell += '"';
          i++; // 次の文字もスキップ
        } else {
          // クォーテーションの開始または終了
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // カンマでセル区切り（クォーテーション外のみ）
        currentRow.push(currentCell);
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !insideQuotes) {
        // 改行で行区切り（クォーテーション外のみ）
        if (char === '\r' && nextChar === '\n') i++; // CRLF対応

        currentRow.push(currentCell);
        // 空行でなければ追加
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        // 通常の文字
        currentCell += char;
      }
    }
    // 最後の行の処理
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }

    // ヘッダーを除去し、オブジェクト配列に変換
    const data: Card[] = [];
    // 1行目はヘッダーとみなしてスキップ (i = 1から開始)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // A列とB列がある場合のみ
      if (row.length >= 2) {
        data.push({
          id: i,
          question: row[0].trim(),
          answer: row[1].trim()
        });
      }
    }
    return data;
  };

  // データ読み込み
  useEffect(() => {
    const fetchCSV = async () => {
      try {
        const response = await fetch('/way.csv');
        // 文字化け対策（Excel等のShift-JIS対策が必要な場合はここでデコードが必要だが、通常はUTF-8推奨）
        const text = await response.text();
        const data = parseCSV(text);

        setAllCards(data);
        setPlayCards(data);
        setLoading(false);
      } catch (error) {
        console.error('CSV load error:', error);
        setLoading(false);
      }
    };

    fetchCSV();
  }, []);

  // --- 以下、操作ロジック（前回と同じ） ---

  const handleCorrect = () => {
    const currentCardId = playCards[currentIndex].id;
    if (wrongIds.has(currentCardId)) {
      const newWrongs = new Set(wrongIds);
      newWrongs.delete(currentCardId);
      setWrongIds(newWrongs);
    }
    goNext();
  };

  const handleWrong = () => {
    const currentCardId = playCards[currentIndex].id;
    setWrongIds(prev => new Set(prev).add(currentCardId));
    goNext();
  };

  const goNext = () => {
    setShowAnswer(false);
    if (currentIndex < playCards.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsFinished(true);
    }
  };

  const goBack = () => {
    if (currentIndex > 0) {
      setShowAnswer(false);
      setCurrentIndex(prev => prev - 1);
      setIsFinished(false);
    }
  };

  const startRetry = () => {
    const wrongCards = allCards.filter(card => wrongIds.has(card.id));
    setPlayCards(wrongCards);
    setCurrentIndex(0);
    setShowAnswer(false);
    setIsFinished(false);
  };

  const resetAll = () => {
    setPlayCards(allCards);
    setCurrentIndex(0);
    setShowAnswer(false);
    setIsFinished(false);
    setWrongIds(new Set());
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center">読み込み中...</div>;
  if (playCards.length === 0 && !isFinished) return <div className="flex min-h-screen items-center justify-center">データがありません</div>;

  // 完了画面
  if (isFinished) {
    const wrongCount = wrongIds.size;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gray-100 text-slate-800">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">終了！</h2>
          <p className="mb-6 text-lg">
            現在の苦手登録数: <span className="font-bold text-red-500 text-2xl">{wrongCount}</span> 問
          </p>
          <div className="flex flex-col gap-3">
            {wrongCount > 0 && (
              <button onClick={startRetry} className="bg-red-500 hover:bg-red-600 text-white py-3 rounded-lg font-bold transition shadow">
                間違えた問題だけ解く ({wrongCount}問)
              </button>
            )}
            <button onClick={resetAll} className="bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg font-bold transition shadow">
              全問を最初から解く
            </button>
            <button onClick={goBack} className="text-gray-500 hover:text-gray-800 mt-2 underline">
              最後の問題に戻る
            </button>
          </div>
        </div>
      </main>
    );
  }

  const currentCard = playCards[currentIndex];

  return (
    // 画面が小さくても見切れないように py-8 で上下に余白を確保
    <main className="flex min-h-screen flex-col items-center justify-center p-4 py-8 bg-gray-100 text-slate-800">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[90vh] h-full">

        {/* ヘッダー */}
        <div className="bg-slate-800 p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold">単語帳</span>
          <span className="text-sm bg-slate-700 px-2 py-1 rounded">
            {currentIndex + 1} / {playCards.length}
          </span>
        </div>

        {/* メインコンテンツエリア（スクロール可能にする） */}
        <div className="flex-1 p-6 flex flex-col overflow-y-auto">

          {/* 問い：長文対応 */}
          <div className="mb-6">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 sticky top-0 bg-white pb-2">
              Question
            </h2>
            {/* whitespace-pre-wrap: 改行コードを反映, break-words: 長い単語を折り返し */}
            <p className="text-2xl font-bold text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
              {currentCard.question}
            </p>
          </div>

          {/* 仕切り線 */}
          <hr className="border-slate-100 mb-6" />

          {/* 答えエリア */}
          <div className="mt-auto">
            {!showAnswer ? (
              <div className="min-h-[100px] flex items-end">
                <button
                  onClick={() => setShowAnswer(true)}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow transition"
                >
                  答えを表示
                </button>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 pb-2">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Answer</h2>
                <p className="text-xl font-bold text-red-600 mb-6 whitespace-pre-wrap break-words">
                  {currentCard.answer}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleWrong}
                    className="bg-red-100 hover:bg-red-200 text-red-700 py-3 rounded-xl transition border-2 border-red-200 flex flex-col items-center"
                  >
                    <span className="text-lg font-bold">✕ わからない</span>
                  </button>
                  <button
                    onClick={handleCorrect}
                    className="bg-green-100 hover:bg-green-200 text-green-700 py-3 rounded-xl transition border-2 border-green-200 flex flex-col items-center"
                  >
                    <span className="text-lg font-bold">○ 正解！</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* フッター：戻るボタン（固定） */}
        <div className="bg-slate-50 p-3 flex justify-start border-t border-slate-100 shrink-0">
          <button
            onClick={goBack}
            disabled={currentIndex === 0}
            className={`text-sm font-medium px-3 py-2 rounded transition
              ${currentIndex === 0
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-500 hover:bg-gray-200 hover:text-gray-800'
              }`}
          >
            ← 前の問題へ
          </button>
        </div>
      </div>
    </main>
  );
}
// interview.txt / interview_full.txt 원본 텍스트를 파싱해서
// [{ name, questions: [{ question, keywords, answer, subcategory }] }] 구조로 변환한다.
//
// 파일 포맷 규칙 (완전히 정형화되어 있지 않아 최대한 관대하게 처리):
//  - "🔴 ..." / "🟡 ..." 로 시작하는 줄 = 대분류 카테고리 제목
//  - "[서브카테고리]" 형태의 줄 = 카테고리 안의 소제목
//  - "N. 제목" 처럼 숫자로 시작하는 짧은 줄이, 카테고리 직후(질문이 하나도 없는 상태)에
//    나오면 그 카테고리의 실제 이름으로 취급한다 (예: "🔴 반드시 답변까지 준비" 다음에
//    바로 나오는 "1. 자기소개 · 이직").
//  - "**"가 포함된 줄 = 질문. 앞의 "⭐" 표시는 무시하고, "**" 뒤쪽 텍스트를 질문으로 쓴다.
//    드물게 같은 줄 끝에 "(키워드 / 키워드)" 형태가 붙어 있으면(예: "(격한 충돌 적음 / ...)")
//    그것도 키워드로 분리한다. 단, "(최종)"처럼 "/"가 없는 짧은 꼬리표는 질문 제목의
//    일부로 남겨둔다.
//  - 질문 다음 줄이 "(...)" 로 시작/끝나면 키워드 요약 줄로 인식한다.
//  - 그 다음부터 빈 줄이 나오기 전까지의 줄들은 전부 답변 본문으로 합친다.
//  - 질문 마커 없이 카테고리 제목 아래 바로 텍스트가 나오는 경우(마무리 인사말 등)는
//    카테고리 이름을 질문처럼 사용하는 "pseudo 질문"으로 묶는다.

function parseInterviewText(raw) {
  const lines = raw.split(/\r?\n/);

  const categories = [];
  let currentCategory = null;
  let currentSubcategory = null;
  let currentQA = null;
  let pendingStar = false; // 직전 줄이 "⭐⭐"만 있는 별도 줄이었는지

  const STAR_ONLY = /^⭐+$/;
  const CATEGORY_EMOJI = /^(?:🔴|🟡)\s*(.*)$/;
  const BRACKET_SUB = /^\[(.+)\]$/;
  const NUMBERED_HEADING = /^(\d+)\.\s*(.+)$/;

  function ensureCategory(name) {
    currentCategory = { name, questions: [] };
    categories.push(currentCategory);
    currentSubcategory = null;
  }

  function finalizeQA() {
    if (!currentQA) return;
    const answer = currentQA.answerLines.join(' ').replace(/\s+/g, ' ').trim();

    if (currentQA.isPseudo) {
      const last = currentCategory.questions[currentCategory.questions.length - 1];
      if (last && last.isPseudo) {
        last.answer = (last.answer + ' ' + answer).trim();
        currentQA = null;
        return;
      }
    }

    currentCategory.questions.push({
      question: currentQA.question,
      keywords: currentQA.keywords || '',
      answer,
      subcategory: currentQA.subcategory || null,
      isPseudo: !!currentQA.isPseudo,
      starred: !!currentQA.starred,
    });
    currentQA = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === '') {
      pendingStar = false;
      finalizeQA();
      continue;
    }

    if (STAR_ONLY.test(line)) {
      pendingStar = true;
      continue;
    }

    const catMatch = line.match(CATEGORY_EMOJI);
    if (catMatch) {
      pendingStar = false;
      finalizeQA();
      let name = catMatch[1].trim().replace(/^\d+\.\s*/, '');
      ensureCategory(name || '기타');
      continue;
    }

    const subMatch = line.match(BRACKET_SUB);
    if (subMatch) {
      pendingStar = false;
      finalizeQA();
      currentSubcategory = subMatch[1].trim();
      continue;
    }

    const numMatch = line.match(NUMBERED_HEADING);
    if (
      numMatch &&
      !currentQA &&
      currentCategory &&
      currentCategory.questions.length === 0 &&
      numMatch[2].length < 20 &&
      !numMatch[2].includes('?')
    ) {
      pendingStar = false;
      currentCategory.name = numMatch[2].trim();
      currentSubcategory = null;
      continue;
    }

    if (line.includes('**')) {
      finalizeQA();
      const beforeMarker = line.slice(0, line.indexOf('**')).trim();
      const inlineStarred = beforeMarker.length > 0 && /^⭐+$/.test(beforeMarker);
      const starred = pendingStar || inlineStarred;
      pendingStar = false;

      let q = line.slice(line.indexOf('**') + 2).trim();
      let inlineKeywords = null;

      const trailMatch = q.match(/^(.*?)\s*(\([^()]*\))\s*$/);
      if (trailMatch && trailMatch[1].trim() && trailMatch[2].includes('/')) {
        q = trailMatch[1].trim();
        inlineKeywords = trailMatch[2].slice(1, -1).trim();
      }

      if (!currentCategory) ensureCategory('기타');

      currentQA = {
        question: q,
        keywords: inlineKeywords,
        answerLines: [],
        subcategory: currentSubcategory,
        isPseudo: false,
        starred,
      };
      continue;
    }

    // 일반 본문 줄
    pendingStar = false;
    if (currentQA) {
      if (currentQA.keywords === null && /^\(.*\)$/.test(line)) {
        currentQA.keywords = line.slice(1, -1).trim();
      } else {
        currentQA.answerLines.push(line);
      }
    } else if (currentCategory) {
      // 괄호/별표 없이 짧게 등장하는 소제목 줄 (예: "HD현대중공업", "KB태블릿브랜치")
      // → 서브카테고리로 취급. 답변 문단이 여러 줄로 줄바꿈된 경우는 이 분기를
      // 타지 않으므로(항상 currentQA가 있는 상태) 영향받지 않는다.
      if (!line.startsWith('⭐') && !/^\d+\./.test(line) && line.length <= 15) {
        currentSubcategory = line;
      } else {
        currentQA = {
          question: currentCategory.name,
          keywords: null,
          answerLines: [line],
          subcategory: currentSubcategory,
          isPseudo: true,
          starred: false,
        };
      }
    }
  }
  finalizeQA();

  return categories.filter((c) => c.questions.length > 0);
}

// 항상 맨 앞에 오는 "1분 자기소개"와, 순서를 랜덤으로 섞어 그 다음에 배치할
// 5개 질문(성격 장단점 / 강점 / 약점 / 협업·갈등 경험 / 지원 동기)을
// 카테고리들에서 찾아 분리해낸다.
function extractSpecialQuestions(categories) {
  function findAndRemove(patterns) {
    for (const pattern of patterns) {
      for (const cat of categories) {
        const idx = cat.questions.findIndex((q) => pattern(q.question));
        if (idx !== -1) {
          const [item] = cat.questions.splice(idx, 1);
          return item;
        }
      }
    }
    return null;
  }

  const intro = findAndRemove([(q) => q.includes('1분') && q.includes('자기소개')]);

  const slots = [
    {
      label: '성격의 장단점',
      patterns: [(q) => q.includes('성격') && q.includes('장') && q.includes('단')],
    },
    {
      label: '가장 큰 강점',
      patterns: [(q) => q.includes('강점')],
    },
    {
      label: '약점 · 보완점',
      patterns: [(q) => q.includes('약점')],
    },
    {
      label: '협업 · 갈등 경험',
      patterns: [
        (q) => q.includes('개발자') && q.includes('충돌'),
        (q) => q.includes('충돌') && q.includes('경험'),
        (q) => q.includes('갈등') && q.includes('경험'),
      ],
    },
    {
      label: '지원 동기 · 이직 이유',
      patterns: [(q) => q.includes('이직') && q.includes('이유')],
    },
  ];

  const specials = slots
    .map((slot) => findAndRemove(slot.patterns))
    .filter(Boolean);

  const remaining = categories.filter((c) => c.questions.length > 0);

  return { intro, specials, categories: remaining };
}

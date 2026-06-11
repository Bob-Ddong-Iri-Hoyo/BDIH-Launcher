# LogViewer

Source: `src/Renderer/Component/LogViewer.tsx`
Story: `src/Renderer/Stories/Component/LogViewer.stories.tsx`

역할:

- App 로그와 Bottle 실행 로그를 target/session 단위로 탐색하는 로그 뷰어.

- BDIH-Logger App에 대한 로그와 유저 Bottle들의 로그를 분리해서 기록해 둘 필요가 있음
- 떄로는 병렬적으로 Bottle들이 실행 될 수 있음.(Hoyogame + Eternal Return)
- App 자체 로그와 각 Bottle 실행 로그를 분리해서 탐색한다. 사용자는 먼저 “어떤 대상의 로그를 볼지” 고르고, 그 다음 “그 대상의 어떤 실행/날짜 로그를 볼지” 고른다.


현재 UI:

- 위 아래 2단 구조
- 위: <select>형태의 창으로(아마 컴포넌트에 있음 그걸 쓰면 됨) 로그 타겟들을 선택 기본은 App Logs, 그 다음은 bottles 이름이다. 선호 바틀을 선택해 놓으면 셀렉트 창 위쪽에 선호 바틀의 버튼이 생성된다. 생성 시에는 애니메이션으로 부드럽게 생성되고 log target의 div가 리사이즈 되는 애니메이션이 필요함. 자연스럽게 선호 바틀의 버튼이 추가되도록 한다.
- 아래: 좌우 2단으로 분리되어 있음
- 왼쪽: 선택한 대상의 로그 실행 기록 목록이다. 기본은 현재 실행되고 있는 로그이다.
- 오른쪽: 선택한 로그 내용 , 검색, 레벨, 소스 필터 레벨 필터이다.

단독으로 사용하는 예시의 경우, 상단의 셀렉트 창대신 bottle의 이름만 존재하면 된다.
보통 이 경우는 Dialog나 modal 같은 형식으로 사용되게됨(예시 : bottles context 메뉴에서 로그 버튼 클릭과 같이)



데이터 모델:

- `LogTarget`: App Logs 또는 Bottle 하나.
- `LogSession`: 하나의 app 실행 로그 또는 하나의 Bottle 실행 로그.
- `LogEntry`: 특정 session에 속한 로그 라인.
- `sessionId`로 LogSession과 LogEntry를 연결한다.

주요 props:

- `entries`
- `sessions`
- `sources`
- optional controlled values: `selectedTargetId`, `selectedSessionId`, `selectedSourceId`, `selectedLevel`, `searchValue`
- callbacks: `onTargetChange`, `onSessionChange`, `onSourceChange`, `onLevelChange`, `onSearchChange`

기본 선택:

- 처음 들어오면 App Logs target을 선택한다.
- App Logs 안에서는 최신 App log session을 선택한다.

상호작용:

- target을 누르면 History가 해당 target의 session 목록으로 바뀐다.
- History item을 누르면 오른쪽 로그 본문이 해당 session으로 바뀐다.
- search/source/level filter는 현재 선택된 session 안에서만 적용된다.

UI 변경 지시 포인트:

- sidebar width.
- target/history card density.
- running 상태 점과 animation.
- filter toolbar layout.
- log body wrapping/scrolling.

하지 말 것:

- 로그 대상 선택을 dropdown 하나로 숨기지 않는다.
- App 로그와 Bottle 로그를 category filter 하나로만 합치지 않는다.
- Bottle 로그가 계속 누적되는 것처럼 보이게 하지 않는다.
- MainFrame sidebar 아래에 날짜 목록을 붙이지 않는다.




StoryBook
- 기본 전체 제공하는 모습
- 단축형 기본 예시 (모달, dialog같은 형식에서 쓰이는 모습)
- 단축형 실제 예시(이건 진짜 예시 버튼을 누르면 동작하는 방식으로 visualize)
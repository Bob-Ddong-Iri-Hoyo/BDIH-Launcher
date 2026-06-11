# PreferenceView

Source: `src/Renderer/View/PreferenceView/PreferenceView.tsx`
App: `src/Renderer/View/PreferenceView/App.tsx`
Story: `src/Renderer/Stories/View/PreferenceView.stories.tsx`

역할:

- 설정 화면 본체.

현재 UI:

- 상단 우측에 site, github, youtube developer links.
- 카테고리 tabs/cards: general, wine, shortcut, Developer Info.
- General: language, theme(Dark, Light, system settings), app update panel.
- Wine: install path, execution options. wine prefix 저장 위치, DXMT버전별 저장 위치
- Shortcut: shortcut preview/edit buttons.(open log, open settings만 있음. 내가 키보드 입력하면 입력되게해야함 meta+B뭐 이런식으로 )
- 변경사항이 있으면 하단 fixed save bar가 나타난다.

주요 props:

- `installPath`
- `locale`
- `accentColor`
- `autoUpdateEnabled`
- `appUpdateStatus`
- developer links.
- change/save/reset callbacks.

UI 변경 지시 포인트:

- developer link group 위치.
- category selector 모양.
- General/Wine/Shortcut 섹션 구성.
- save bar 노출 방식.
- update panel 위치.

유지할 계약:

- 설정 변경 시 `markChanged` 흐름을 유지한다.
- locale/accent color는 SelectMenu를 사용한다.

# SplashView

Source: `src/Renderer/View/SplashView/SplashPage.tsx`
App: `src/Renderer/View/SplashView/App.tsx`
Story: `src/Renderer/Stories/View/SplashPage.stories.tsx`

역할:

- 앱 시작 로딩 화면.

현재 UI:

- wide logo image를 중심 visual로 사용한다.
- overlay 안에 title, message, progress bar.
- progress에 따라 title fill layer가 올라오는 효과.

주요 props:

- `progress`
- `message`
- `logoSrc`

UI 변경 지시 포인트:

- logo 크기와 위치.
- progress effect.
- loading message 위치.
- background/overlay 강도.

유지할 계약:

- Splash는 실제 로딩/준비 상태를 보여주는 첫 화면이다.
- Storybook animation은 story에서만 제어한다.

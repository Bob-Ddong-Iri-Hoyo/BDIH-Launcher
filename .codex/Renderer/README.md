# Renderer UI Editing Index

이 디렉터리는 Codex에게 UI 변경을 지시하기 위한 작업 문서 모음이다.

사용 방식:

- Component UI를 바꾸고 싶으면 `Component/{Name}.md`를 수정한다.
- View 전체 흐름이나 화면 조립을 바꾸고 싶으면 `View/{Name}.md`를 수정한다.
- 문서를 수정한 뒤 "이 문서 기준으로 구현해줘"라고 지시한다.

구분:

- `Component/`: 여러 View에서 재사용하거나 View를 구성하는 UI 단위.
- `View/`: Electron window가 로드하는 화면, App container, 화면 조립 단위.

규칙:

- 문서에는 원하는 최종 UI, 유지할 동작, 바꾸면 안 되는 계약을 적는다.
- 코드 위치와 Storybook 위치를 함께 유지한다.
- 파일명은 가능한 실제 export 이름 또는 화면 이름과 맞춘다.

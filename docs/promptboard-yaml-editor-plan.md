# PromptBoard YAML Editor 현행 구조

## 목적

`PromptBoard`는 생성 중 태그를 선택하고 prompt preview/replace 결과를 확인하는 노드다.

`PromptBoard YAML Editor`는 YAML 파일을 관리하는 별도 노드다. YAML 작성, 수정, 검증, 저장, 섹션/태그 추가를 담당하며, `PromptBoard`의 생성 UI와 자동 동기화하지 않는다.

## 역할 분리

### PromptBoard

`PromptBoard`는 생성용 UI다.

현재 제공 기능:

- YAML 파일 선택
- `Reload YAML`
- 템플릿 선택, 저장, 삭제
- 보드 검색
- 그룹 필터
- 태그 선택
- 선택 초기화
- `selection_json`, `preview_text`, `prompt_preview`, `replace_report` 출력

`PromptBoard`에는 YAML 원문 편집 UI를 노출하지 않는다. YAML 원문 수정은 `PromptBoard YAML Editor`에서 처리한다.

내부 workflow 호환 값:

- `yaml_file`
- `yaml_text`
- `selected_state`

### PromptBoard YAML Editor

`PromptBoard YAML Editor`는 YAML 관리용 UI다.

현재 제공 기능:

- YAML 파일 선택
- YAML 원문 로드
- YAML 원문 편집
- YAML 원문 검색
- schema validation
- 저장 전 자동 백업
- YAML 저장
- 섹션 추가
- 태그 추가
- 중복 `text` 차단
- 중복 `label` 경고

노드 출력:

- `yaml_file`

관리 상태와 YAML 원문은 출력하지 않는다. `yaml_text`는 workflow 호환을 위한 hidden widget으로만 유지한다.

## YAML 선택과 동기화

`PromptBoard`와 `PromptBoard YAML Editor`는 각각 독립적인 YAML 선택창을 가진다.

Editor에서 저장해도 기존 `PromptBoard` 노드는 자동으로 다시 읽지 않는다. 저장된 내용을 `PromptBoard`에 반영하려면 `PromptBoard`에서 `Reload YAML`을 누르거나 YAML 파일을 다시 선택한다.

이 원칙은 하나의 workflow에 여러 `PromptBoard` 노드가 있을 때 의도치 않은 동시 변경을 막기 위한 것이다.

## Editor UI 동작

### 버튼

Editor의 주요 작업 버튼:

- `Load`
- `Validate`
- `Save`

세 버튼은 고정 폭을 사용한다. 작업 중, 성공, 실패 상태가 표시되어도 toolbar 레이아웃이 흔들리지 않는다.

버튼 상태:

- 처리 중: 파란 계열, `처리 중`
- 성공: 초록 계열, `완료`
- 실패: 빨간 계열, `오류`

상태 텍스트는 짧게 표시된 뒤 원래 버튼 라벨로 돌아간다.

### CodeMirror 편집기

Editor는 bundled CodeMirror 6 YAML 편집기를 사용한다.

동작 원칙:

- 긴 줄은 자동 줄바꿈하지 않는다.
- 긴 줄은 가로 스크롤로 확인한다.
- CodeMirror 로드 실패 시 textarea fallback을 사용한다.
- `Cmd+S` / `Ctrl+S`는 현재 YAML 저장을 실행한다.

### YAML 원문 검색

Editor 검색은 YAML 원문 라인 기준으로 동작한다.

동작:

- 입력한 패턴을 정규식으로 해석한다.
- 현재/전체 match count를 표시한다.
- 현재 match 라인을 하이라이트한다.
- `Enter`는 다음 결과로 이동한다.
- `Shift+Enter`는 이전 결과로 이동한다.
- `Cmd+F` / `Ctrl+F`는 검색창에 포커스한다.

검색어가 있는 상태에서 YAML 원문을 수정해도 커서 위치를 검색 결과로 강제 이동하지 않는다. 검색 이동은 검색어 입력 또는 `Enter` 탐색 시에만 발생한다.

## 저장 정책

Editor 저장은 다음 순서로 처리한다.

1. 현재 YAML 원문을 validation한다.
2. validation 실패 시 저장하지 않는다.
3. 저장 전 백업 파일을 생성한다.
4. YAML 파일을 저장한다.
5. 저장 결과를 버튼 상태와 status 영역에 표시한다.

파일 접근 정책:

- `tags/` 아래 YAML 파일만 대상으로 한다.
- `.yaml` / `.yml` 확장자만 허용한다.
- path traversal은 차단한다.
- 저장 실패 시 기존 원본 파일을 유지한다.

백업 파일명 형식:

```text
<name>.yaml.bak-YYYYMMDD-HHMMSS
```

## 섹션/태그 추가

Editor는 팝업으로 섹션 또는 태그를 현재 YAML 원문에 삽입한다.

공통 입력:

- 대상 카테고리
- 추가 위치
  - 카테고리 하단
  - 선택 섹션 하단
- 추가 타입
  - 섹션
  - 태그

섹션 입력:

- section label

태그 입력:

- `text`
- `label`
- `description`
- `default`

삽입 후에는 Editor의 YAML 원문이 갱신된다. 실제 파일 반영은 사용자가 `Save`를 실행해야 한다.

## 템플릿 계약

템플릿은 YAML 원문을 저장하지 않는다.

템플릿 저장 데이터:

```json
{
  "name": "template name",
  "yaml_file": "default.yaml",
  "selected_state": {}
}
```

템플릿 동작:

- 템플릿 저장 시 `yaml_file`과 `selected_state`만 저장한다.
- 템플릿 로드 시 `yaml_file` 기준으로 YAML 원문을 다시 읽는다.
- 읽은 YAML 원문을 `PromptBoard`의 hidden `yaml_text`에 동기화한다.
- 저장된 `selected_state`는 현재 YAML 기준으로 prune/migration한다.
- Editor의 YAML 선택 상태는 템플릿과 자동 연결하지 않는다.

## API

YAML Editor와 PromptBoard가 사용하는 YAML API:

- `GET /promptboard/yaml/files`
- `GET /promptboard/yaml/file?name=...`
- `POST /promptboard/yaml/file`
- `POST /promptboard/yaml/validate`
- `POST /promptboard/yaml/backup`

템플릿 API:

- `GET /promptboard/templates`
- `GET /promptboard/template`
- `POST /promptboard/template`
- `DELETE /promptboard/template`

## 현재 제외 기능

다음 기능은 현재 YAML Editor가 제공하지 않는다.

- 태그 삭제
- 태그 이동
- 태그 rename
- 섹션 이동
- 섹션 rename
- 카테고리 추가, 이동, 삭제, rename
- tag set 전용 편집 UI
- attribute board 전용 편집 UI
- 저장 전 diff preview
- 백업 목록 보기
- 백업 복원
- 템플릿 영향 분석
- PromptBoard와 Editor의 자동 동기화
- YAML 주석과 원래 포맷의 완전 보존 보장
- workflow 저장값에서 `yaml_text` 제거

이 기능들은 현재 문서나 UI에서 제공되는 기능처럼 설명하지 않는다.

## 검증 기준

문서와 구현이 맞는지 확인할 때 보는 기준:

- `PromptBoard`와 `PromptBoard YAML Editor` 양쪽에 YAML 선택창이 있다.
- 두 노드의 YAML 선택 상태는 독립이다.
- Editor는 `yaml_file`만 출력한다.
- Editor는 Load, Validate, Save, YAML 원문 검색, 섹션 추가, 태그 추가를 제공한다.
- Editor 저장 전 validation과 backup이 실행된다.
- invalid YAML은 저장되지 않는다.
- PromptBoard에서 `Reload YAML`을 누르면 Editor 저장 내용이 반영된다.
- 템플릿 저장/로드 계약은 `name`, `yaml_file`, `selected_state`만 사용한다.
- 기존 workflow의 `yaml_text` hidden widget 호환성을 유지한다.

import type { NightnovaQueueItem } from '../../shared/nightnova'

export interface NightnovaBundle {
  id: string
  title: string
  description: string
  tasks: NightnovaQueueItem[]
}

// Ten bounded units, one local runtime session. No Git commit, CI or
// deployment is requested. The operator chooses this bundle explicitly.
export const NIGHTNOVA_BUNDLES: NightnovaBundle[] = [
  {
    id: 'longshot-10',
    title: '풀롱샷: 10개 기능 묶음',
    description: '소스 구현 중심으로 열 가지 작업을 순차 실행합니다. 최종 검증은 별도 1회만 수행합니다.',
    tasks: [
      ['핵심 사용 흐름의 미구현 기능 한 가지를 찾아 실제 동작까지 구현하라. 기존 구조를 재사용하고 바뀐 파일을 설명하라.', true],
      ['작업 실행 또는 API 연결을 막는 주요 오류 한 가지를 찾아 수정하라. 실패 경로의 사용자 오류 메시지도 연결하라.', true],
      ['실제 사용자가 첫 실행 후 주요 기능에 도달하는 흐름을 개선하라. 필요한 UI와 상태 저장을 함께 완성하라.', true],
      ['에이전트 또는 백엔드 작업 중 단절·취소·실패 시 중복 실행 없이 안전하게 복구하도록 구현을 개선하라.', true],
      ['브라우저 또는 화면 분할의 탐색·전환·크기 조절을 편리하게 만드는 기능을 하나 완성하라.', true],
      ['사용자가 작업 진행 상태를 이해하고 조작할 수 있게 로그·상태·실행 제어 UI를 개선하라.', true],
      ['불필요한 네트워크 호출, 반복 검증, 저장공간 사용 등 실행 자원 낭비를 개선하라. 필요한 최소 기능만 변경하라.', true],
      ['Windows 실행 및 배포에서 원인 확인이 가능한 실질적인 장애를 하나 해결하라. 신규 CI 실행은 만들지 마라.', true],
      ['예외 상황이나 입력 오류를 일으킬 수 있는 실제 동작 문제를 하나 수정하고 해당 조건의 집중 테스트만 작성하라.', true],
      ['이번 묶음에서 연결이 빠진 실사용 기능을 마무리하고 재개·인계 방법을 프로젝트 문서에 반영하라.', true]
    ].map(([instruction, expectChanges]) => ({
      instruction: instruction as string, expectChanges: expectChanges as boolean
    }))
  }
]

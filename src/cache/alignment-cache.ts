import * as fs          from 'fs'

import { log }          from '../config'
import {
  Alignable,
  Facenet,
  FaceEmbedding,
}                       from '../facenet'
import {
  Face,
}                       from '../face'
import {
  imageMd5,
  imageToData,
  loadImage,
}                       from '../misc'

import { DbCache }      from './db-cache'
import { FaceCache }    from './face-cache'

export interface AlignmentCacheData {
  [key: string]: FaceEmbedding,
}

export class AlignmentCache implements Alignable {
  public db: DbCache
  public faceCache: FaceCache

  public dbName   = 'alignment'

  constructor(
    public facenet: Facenet,
    public rootDir: string,
  ) {
    log.verbose('AlignmentCache', 'constructor(%s)', rootDir)
  }

  public init(): void {
    log.verbose('AlignmentCache', 'init()')

    if (!fs.existsSync(this.rootDir)) {
      throw new Error(`directory not exist: ${this.rootDir}`)
    }

    if (!this.db) {
      this.db = new DbCache(this.rootDir, this.dbName)
    }

    this.faceCache = new FaceCache(this.rootDir)
  }

  public async clean(): Promise<void> {
    log.verbose('AlignmentCache', 'clean()')
    await this.db.clean()
  }

  public async align(imageData: ImageData | string ): Promise<Face[]> {
    if (typeof imageData === 'string') {
      const filename = imageData
      log.verbose('AlignmentCache', 'align(%s)', filename)
      imageData = imageToData(
        await loadImage(filename),
      )
    } else {
      log.verbose('AlignmentCache', 'align(%dx%d)',
                                    imageData.width,
                                    imageData.height,
                  )
    }

    const md5 = imageMd5(imageData)
    let faceList = await this.get(md5)

    if (faceList !== null) {
      log.silly('AlignmentCache', 'align() HIT')
      return faceList
    }
    log.silly('AlignmentCache', 'align() MISS')

    faceList = await this.facenet.align(imageData)
    await this.put(md5, faceList)

    return faceList
  }

  private async get(
    md5: string,
  ): Promise<Face[] | null> {
    const faceMd5List = await this.db.get(md5) as string[]

    if (faceMd5List && Array.isArray(faceMd5List)) {
      const faceList = await Promise.all(
        faceMd5List.map(faceMd5 => this.faceCache.get(faceMd5)),
      )
      if (faceList.some(face => !face)) {
        return null
      } else {
        return faceList as Face[]
      }
    }
    return null
  }

  private async put(
    md5:      string,
    faceList: Face[],
  ): Promise<void> {
    await Promise.all(
      faceList.map(async face => this.faceCache.put(face)),
    )

    const faceMd5List = faceList.map(face => face.md5)
    await this.db.put(md5, faceMd5List)
  }

}
